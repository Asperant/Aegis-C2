using Aegis_API.Controllers;
using Aegis_API.Validators;

namespace Aegis_API.Tests.Validators;

public class LoginRequestValidatorTests
{
    private readonly LoginRequestValidator _validator = new();

    [Fact]
    public void Validate_ShouldFail_WhenUsernameTooShort()
    {
        var request = new LoginRequest { Username = "ab", Password = "secret123" };

        var result = _validator.Validate(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(LoginRequest.Username));
    }

    [Fact]
    public void Validate_ShouldFail_WhenPasswordTooShort()
    {
        var request = new LoginRequest { Username = "commander", Password = "123" };

        var result = _validator.Validate(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(LoginRequest.Password));
    }

    [Fact]
    public void Validate_ShouldPass_ForValidInput()
    {
        var request = new LoginRequest { Username = "commander", Password = "strongpass123" };

        var result = _validator.Validate(request);

        Assert.True(result.IsValid);
    }
}
