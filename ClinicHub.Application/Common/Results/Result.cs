namespace ClinicHub.Application.Common.Results;

/// <summary>
/// The outcome of a use case: success, or one or more <see cref="Error"/>s. Expected failures are
/// never exceptions.
/// </summary>
public class Result
{
    private static readonly Result SuccessResult = new([]);

    protected Result(IReadOnlyList<Error> errors) => Errors = errors;

    public bool IsSuccess => Errors.Count == 0;

    /// <summary>Empty on success; one or more on failure.</summary>
    public IReadOnlyList<Error> Errors { get; }

    /// <summary>Shortcut: the first error (null on success).</summary>
    public Error Error => Errors.Count > 0 ? Errors[0] : null;

    public static Result Success() => SuccessResult;

    public static Result Failure(Error error) => new(Checked([error]));

    public static Result Failure(IEnumerable<Error> errors) => new(Checked(errors));

    public static implicit operator Result(Error error) => Failure(error);

    /// <summary>A failure carries at least one error, and no null ones.</summary>
    protected static IReadOnlyList<Error> Checked(IEnumerable<Error> errors)
    {
        var list = errors?.ToList() ?? [];
        if (list.Count == 0 || list.Contains(null))
            throw new ArgumentException("A failure needs at least one error, and no null ones.", nameof(errors));
        return list;
    }
}

/// <summary>A <see cref="Result"/> that carries <see cref="Data"/> on success.</summary>
public class Result<TData> : Result
{
    private readonly TData data;

    private Result(TData data) : base([]) => this.data = data;

    private Result(IReadOnlyList<Error> errors) : base(errors) { }

    /// <summary>The data; only valid when <see cref="Result.IsSuccess"/>.</summary>
    public TData Data => IsSuccess
        ? data
        : throw new InvalidOperationException($"A failed result has no data (first error: {Error.Code}).");

    public static Result<TData> Success(TData data) => new(data);

    public new static Result<TData> Failure(Error error) => new(Checked([error]));

    public new static Result<TData> Failure(IEnumerable<Error> errors) => new(Checked(errors));

    public static implicit operator Result<TData>(TData data) => Success(data);

    public static implicit operator Result<TData>(Error error) => Failure(error);
}
