using Aegis_API.Commands;
using Aegis_API.Validators;

namespace Aegis_API.Tests.Validators;

public class MissionCommandValidatorTests
{
    private readonly MissionCommandValidator _validator = new();

    [Fact]
    public void Validate_ShouldFail_WhenWaypointsEmpty()
    {
        var request = new SendMissionCommandRequest
        {
            UavId = "UAV-1",
            Waypoints = new List<Waypoint>()
        };

        var result = _validator.Validate(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(SendMissionCommandRequest.Waypoints));
    }

    [Fact]
    public void Validate_ShouldFail_WhenWaypointCountExceedsLimit()
    {
        var request = new SendMissionCommandRequest
        {
            UavId = "UAV-1",
            Waypoints = Enumerable.Range(0, 51)
                .Select(_ => new Waypoint { Lat = 41.0, Lng = 29.0 })
                .ToList()
        };

        var result = _validator.Validate(request);

        Assert.False(result.IsValid);
    }

    [Fact]
    public void Validate_ShouldPass_ForValidMission()
    {
        var request = new SendMissionCommandRequest
        {
            UavId = "UAV-1",
            Waypoints =
            [
                new Waypoint { Lat = 41.015, Lng = 28.979 },
                new Waypoint { Lat = 41.020, Lng = 28.990 }
            ]
        };

        var result = _validator.Validate(request);

        Assert.True(result.IsValid);
    }
}
