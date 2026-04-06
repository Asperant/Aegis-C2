using Aegis_API.Controllers;
using Aegis_API.Validators;

namespace Aegis_API.Tests.Validators;

public class SpawnRequestValidatorTests
{
    private readonly SpawnRequestValidator _validator = new();

    [Theory]
    [InlineData(-91, 30)]
    [InlineData(91, 30)]
    [InlineData(40, -181)]
    [InlineData(40, 181)]
    public void Validate_ShouldFail_ForOutOfRangeCoordinates(double lat, double lon)
    {
        var request = new SpawnRequest { Lat = lat, Lon = lon };

        var result = _validator.Validate(request);

        Assert.False(result.IsValid);
    }

    [Fact]
    public void Validate_ShouldPass_ForValidCoordinates()
    {
        var request = new SpawnRequest { Lat = 41.015, Lon = 28.979 };

        var result = _validator.Validate(request);

        Assert.True(result.IsValid);
    }
}
