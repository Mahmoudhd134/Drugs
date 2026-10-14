using ClinicHub.Application.Common.Results;
using MediatR;

namespace ClinicHub.Application.Common.Messaging;

public interface ICommandHandler<in TCommand> : IRequestHandler<TCommand, Result>
    where TCommand : ICommand;

public interface ICommandHandler<in TCommand, TData> : IRequestHandler<TCommand, Result<TData>>
    where TCommand : ICommand<TData>;
