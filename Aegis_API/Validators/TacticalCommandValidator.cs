using FluentValidation;
using Aegis_API.Commands;

namespace Aegis_API.Validators
{
    public class TacticalCommandValidator : AbstractValidator<SendTacticalCommandRequest>
    {
        public TacticalCommandValidator()
        {
            RuleFor(x => x.UavId)
                .NotEmpty().WithMessage("İHA ID'si boş olamaz.");

            RuleFor(x => x.CommandType)
                .NotEmpty().WithMessage("Komut tipi belirtilmelidir.")
                .Must(ct => Enum.TryParse<TacticalCommandType>(ct, true, out _))
                .WithMessage("Geçersiz komut tipi.");

            RuleFor(x => x.TargetIp)
                .NotEmpty().When(x => x.CommandType?.Equals("HANDOVER", StringComparison.OrdinalIgnoreCase) == true)
                .WithMessage("HANDOVER işlemi için hedef IP/Hostname (TargetIp) zorunludur.");
        }
    }
}
