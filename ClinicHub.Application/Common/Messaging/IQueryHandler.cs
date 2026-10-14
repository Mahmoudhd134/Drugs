using ClinicHub.Application.Common.Results;
using MediatR;

namespace ClinicHub.Application.Common.Messaging;

public interface IQueryHandler<in TQuery, TData> : IRequestHandler<TQuery, Result<TData>>
    where TQuery : IQuery<TData>;
