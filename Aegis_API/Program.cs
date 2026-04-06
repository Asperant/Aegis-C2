using StackExchange.Redis;
using Aegis_API.Services;
using Aegis_API.Metrics;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Net;
using System.Text.Json;
using Serilog;
using FluentValidation;

var builder = WebApplication.CreateBuilder(args);

// 0) Structured logging (Serilog)
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console(outputTemplate: "{Timestamp:HH:mm:ss} [{Level:u3}] {SourceContext} | {Message:lj}{NewLine}{Exception}")
    .WriteTo.File("Logs/aegis-.json",
        rollingInterval: RollingInterval.Day,
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{Level:u3}] {SourceContext} | {Message:lj}{NewLine}{Exception}")
    .CreateLogger();

builder.Host.UseSerilog();

// 1) CORS policy
var frontendUrl = builder.Configuration["Frontend:Url"] ?? "http://localhost:5173";
builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactAppPolicy", policy =>
    {
        policy.WithOrigins(frontendUrl)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// 2) JWT authentication
var jwtSettings = builder.Configuration.GetSection("Jwt");
var secretKey = jwtSettings["Secret"] ?? throw new ArgumentNullException("JWT Secret Key is missing in appsettings");
var key = Encoding.UTF8.GetBytes(secretKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
}).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidAudience = jwtSettings["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(key)
    };

    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/telemetryHub"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();
builder.Services.AddControllers();

// OpenAPI/Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(Program).Assembly));
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// 3) Real-time communication (SignalR)
builder.Services.AddSignalR();

// Redis configuration
var redisConnString = builder.Configuration["Redis:ConnectionString"] ?? "localhost:6379,abortConnect=false";
builder.Services.AddSingleton<IConnectionMultiplexer>(ConnectionMultiplexer.Connect(redisConnString));

// 4) Dependency registration
builder.Services.AddSingleton<IGlobalMetricsService, GlobalMetricsService>();
builder.Services.AddSingleton<IKubernetesOrchestratorService, KubernetesOrchestratorService>();
builder.Services.AddSingleton<IOperationalEventService, OperationalEventService>();

// Background workers
builder.Services.AddHostedService<RedisSubscriberService>();
builder.Services.AddHostedService<Aegis_API.Workers.SystemHealthWorker>();

var app = builder.Build();

// 5) Global exception handling middleware
app.Use(async (context, next) =>
{
    try
    {
        await next(context);
    }
    catch (Exception ex)
    {
        var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
        var traceId = context.TraceIdentifier;
        logger.LogError(ex, "Unhandled application exception. TraceId={TraceId}", traceId);
        
        context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
        context.Response.ContentType = "application/json";
        var result = JsonSerializer.Serialize(new
        {
            error = "Internal Server Error",
            message = "Beklenmeyen bir sunucu hatası oluştu.",
            traceId
        });
        await context.Response.WriteAsync(result);
    }
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("ReactAppPolicy");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapGet("/", () => "Aegis C2 API is running. Swagger UI is available at /swagger in development mode.");

app.MapHub<Aegis_API.Hubs.TelemetryHub>("/telemetryHub");

app.Run();
