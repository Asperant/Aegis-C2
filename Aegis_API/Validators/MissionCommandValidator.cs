using FluentValidation;
using Aegis_API.Commands;

namespace Aegis_API.Validators
{
    public class MissionCommandValidator : AbstractValidator<SendMissionCommandRequest>
    {
        public MissionCommandValidator()
        {
            RuleFor(x => x.UavId)
                .NotEmpty().WithMessage("İHA ID'si boş olamaz.");

            RuleFor(x => x.Waypoints)
                .NotEmpty().WithMessage("Görev rotası en az 1 waypoint içermelidir.")
                .Must(wps => wps.Count <= 50).WithMessage("Maksimum 50 waypoint desteklenir.");

            RuleForEach(x => x.Waypoints).ChildRules(wp =>
            {
                wp.RuleFor(w => w.Lat)
                    .InclusiveBetween(-90, 90).WithMessage("Enlem -90 ile 90 arasında olmalıdır.");
                wp.RuleFor(w => w.Lng)
                    .InclusiveBetween(-180, 180).WithMessage("Boylam -180 ile 180 arasında olmalıdır.");
            });
        }
    }
}
