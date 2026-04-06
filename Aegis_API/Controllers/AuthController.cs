using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using FluentValidation;

namespace Aegis_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IConfiguration _configuration;
        private readonly ILogger<AuthController> _logger;
        private readonly IValidator<LoginRequest> _validator;

        public AuthController(IConfiguration configuration, ILogger<AuthController> logger, IValidator<LoginRequest> validator)
        {
            _configuration = configuration;
            _logger = logger;
            _validator = validator;
        }

        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginRequest request)
        {
            var validationResult = _validator.Validate(request);
            if (!validationResult.IsValid)
            {
                _logger.LogWarning("Geçersiz login isteği: {Errors}", validationResult.Errors.Select(e => e.ErrorMessage));
                return BadRequest(new { Errors = validationResult.Errors.Select(e => e.ErrorMessage) });
            }

            var expectedUser = _configuration["Auth:CommanderUsername"];
            var expectedPass = _configuration["Auth:CommanderPassword"];

            if (request.Username == expectedUser && request.Password == expectedPass)
            {
                var token = GenerateJwtToken(request.Username);
                _logger.LogInformation("Yetkili girişi başarılı: {Username}", request.Username);
                return Ok(new { token });
            }

            _logger.LogWarning("Unauthorized login attempt. Username: {Username}", request.Username);
            return Unauthorized(new { Message = "Invalid credentials." });
        }

        private string GenerateJwtToken(string username)
        {
            var jwtSettings = _configuration.GetSection("Jwt");
            var secretKey = jwtSettings["Secret"] ?? throw new ArgumentNullException("JWT Secret Key is missing in appsettings");
            var _key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, username),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                new Claim(ClaimTypes.Role, "Commander")
            };

            var token = new JwtSecurityToken(
                issuer: jwtSettings["Issuer"],
                audience: jwtSettings["Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddHours(2),
                signingCredentials: new SigningCredentials(_key, SecurityAlgorithms.HmacSha256)
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }

    public class LoginRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }
}
