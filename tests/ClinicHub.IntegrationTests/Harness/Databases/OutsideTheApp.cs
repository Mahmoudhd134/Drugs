using Npgsql;

namespace ClinicHub.IntegrationTests.Harness.Databases;

/// <summary>
/// Raw SQL on a collection's database: ONLY for cases where data is "changed outside the app" (psql, another tool),
/// e.g. a staff member deactivated by hand to check the 30 s cache path, or a row aged by hand. Test data is built
/// with the builders (<see cref="Builders.TestData"/>), never here. Use parameters (<c>@p0</c>, <c>@p1</c>…).
/// </summary>
public sealed class OutsideTheApp(string connectionString)
{
    private readonly string connectionString = DatabaseGuard.Ensure(connectionString);

    /// <summary>Runs a statement; returns the affected rows.</summary>
    public async Task<int> ExecuteAsync(string sql, params object[] parameters)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = Command(connection, sql, parameters);
        return await command.ExecuteNonQueryAsync();
    }

    /// <summary>The first column of the first row (null when none).</summary>
    public async Task<T> ScalarAsync<T>(string sql, params object[] parameters)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = Command(connection, sql, parameters);
        var value = await command.ExecuteScalarAsync();
        return value is null or DBNull ? default : (T)Convert.ChangeType(value, Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T));
    }

    private static NpgsqlCommand Command(NpgsqlConnection connection, string sql, object[] parameters)
    {
        var command = new NpgsqlCommand(sql, connection);
        for (var i = 0; i < parameters.Length; i++)
            command.Parameters.AddWithValue($"p{i}", parameters[i] ?? DBNull.Value);
        return command;
    }
}
