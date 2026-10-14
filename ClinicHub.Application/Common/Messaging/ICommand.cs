using ClinicHub.Application.Common.Results;
using MediatR;

namespace ClinicHub.Application.Common.Messaging;

/// <summary>Marker for every command (with or without data), so behaviors can target commands only.</summary>
public interface ICommandBase;

/// <summary>A use case that changes state and returns no data. Runs in one transaction.</summary>
public interface ICommand : IRequest<Result>, ICommandBase;

/// <summary>A use case that changes state and returns <typeparamref name="TData"/>. Runs in one transaction.</summary>
public interface ICommand<TData> : IRequest<Result<TData>>, ICommandBase;

/// <summary>A use case that only reads: never changes state, never opens a transaction.</summary>
public interface IQuery<TData> : IRequest<Result<TData>>;
