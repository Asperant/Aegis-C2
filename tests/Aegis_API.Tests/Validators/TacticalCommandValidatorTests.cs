using Aegis_API.Commands;
using Aegis_API.Validators;

namespace Aegis_API.Tests.Validators;

public class TacticalCommandValidatorTests
{
    private readonly TacticalCommandValidator _validator = new();

    [Fact]
    public void Validate_ShouldFail_ForUnknownCommand()
    {
        var request = new SendTacticalCommandRequest
        {
            UavId = "UAV-1",
            CommandType = "UNKNOWN_CMD"
        };

        var result = _validator.Validate(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(SendTacticalCommandRequest.CommandType));
    }

    [Fact]
    public void Validate_ShouldFail_ForHandoverWithoutTargetIp()
    {
        var request = new SendTacticalCommandRequest
        {
            UavId = "UAV-1",
            CommandType = "HANDOVER",
            TargetIp = ""
        };

        var result = _validator.Validate(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(SendTacticalCommandRequest.TargetIp));
    }

    [Fact]
    public void Validate_ShouldPass_ForValidHandover()
    {
        var request = new SendTacticalCommandRequest
        {
            UavId = "UAV-1",
            CommandType = "HANDOVER",
            TargetIp = "aegis-gks-42"
        };

        var result = _validator.Validate(request);

        Assert.True(result.IsValid);
    }
}
