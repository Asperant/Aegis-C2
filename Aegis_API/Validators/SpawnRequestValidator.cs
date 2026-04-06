using FluentValidation;
using Aegis_API.Controllers;

namespace Aegis_API.Validators
{
    public class SpawnRequestValidator : AbstractValidator<SpawnRequest>
    {
        public SpawnRequestValidator()
        {
            RuleFor(x => x.Lat)
                .InclusiveBetween(-90, 90).WithMessage("Enlem -90 ile 90 arasında olmalıdır.");

            RuleFor(x => x.Lon)
                .InclusiveBetween(-180, 180).WithMessage("Boylam -180 ile 180 arasında olmalıdır.");
        }
    }
}
