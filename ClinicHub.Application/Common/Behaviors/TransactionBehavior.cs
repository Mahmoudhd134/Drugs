using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using MediatR;

namespace ClinicHub.Application.Common.Behaviors;

/// <summary>
/// Last behavior, commands only (<see cref="ICommandBase"/>; queries pass through): the handler runs in
/// one transaction through <see cref="ITransactionRunner"/>, committed only when its <see cref="Result"/>
/// succeeds (or always, for an <see cref="ICommitOnFailure"/> command). A failed result or an exception
/// rolls back everything it saved. A command sent while another one runs joins that transaction.
/// </summary>
public sealed class TransactionBehavior<TRequest, TResponse>(ITransactionRunner transactions)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken) =>
        request is ICommandBase
            ? transactions.RunAsync(token => next(token),
                response => request is ICommitOnFailure || response is Result { IsSuccess: true },
                cancellationToken)
            : next(cancellationToken);
}
