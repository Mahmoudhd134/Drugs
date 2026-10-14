namespace ClinicHub.Application.Common.Results;

/// <summary>An expected failure, declared once per feature (<c>DrugErrors</c>…) or in <see cref="CommonErrors"/>.</summary>
/// <param name="Code">A stable API contract: the frontend translates it (<c>errors.{code}</c>).</param>
/// <param name="Description">English, for developers and logs; the UI never shows it.</param>
/// <param name="Field">Request property the error is about (validation errors only).</param>
public record Error(string Code, string Description, ErrorType Type, string Field = null);
