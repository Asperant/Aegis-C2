using FluentValidation;

namespace Aegis_API.Validators
{
    public class LoginRequestValidator : AbstractValidator<Controllers.LoginRequest>
    {
        public LoginRequestValidator()
        {
            RuleFor(x => x.Username)
                .NotEmpty().WithMessage("Kullanıcı adı boş olamaz.")
                .Length(3, 50).WithMessage("Kullanıcı adı 3-50 karakter arasında olmalıdır.");

            RuleFor(x => x.Password)
                .NotEmpty().WithMessage("Şifre boş olamaz.")
                .MinimumLength(6).WithMessage("Şifre en az 6 karakter olmalıdır.");
        }
    }
}
