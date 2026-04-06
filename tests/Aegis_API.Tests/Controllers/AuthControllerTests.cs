using Aegis_API.Controllers;
using Aegis_API.Validators;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace Aegis_API.Tests.Controllers;

public class AuthControllerTests
{
    private static AuthController BuildController()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:CommanderUsername"] = "commander",
                ["Auth:CommanderPassword"] = "topsecret",
                ["Jwt:Secret"] = "this_is_a_long_test_secret_key_for_jwt_validation_1234567890",
                ["Jwt:Issuer"] = "Aegis_HQ",
                ["Jwt:Audience"] = "Aegis_UI"
            })
            .Build();

        return new AuthController(config, NullLogger<AuthController>.Instance, new LoginRequestValidator());
    }

    [Fact]
    public void Login_ShouldReturnOkAndToken_ForValidCredentials()
    {
        var controller = BuildController();

        var result = controller.Login(new LoginRequest
        {
            Username = "commander",
            Password = "topsecret"
        });

        var ok = Assert.IsType<OkObjectResult>(result);
        var token = ok.Value?.GetType().GetProperty("token")?.GetValue(ok.Value) as string;

        Assert.False(string.IsNullOrWhiteSpace(token));
    }

    [Fact]
    public void Login_ShouldReturnUnauthorized_ForInvalidCredentials()
    {
        var controller = BuildController();

        var result = controller.Login(new LoginRequest
        {
            Username = "commander",
            Password = "wrong-password"
        });

        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void Login_ShouldReturnBadRequest_ForInvalidPayload()
    {
        var controller = BuildController();

        var result = controller.Login(new LoginRequest
        {
            Username = "a",
            Password = "123"
        });

        Assert.IsType<BadRequestObjectResult>(result);
    }
}
