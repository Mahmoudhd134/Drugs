using System.Reflection;
using ClinicHub.IntegrationTests.Harness.Databases;
using Xunit.Abstractions;
using Xunit.Sdk;

namespace ClinicHub.IntegrationTests.Harness.Running;

/// <summary>
/// xUnit with two additions for the whole test run: the classes are shuffled with the seed (<see cref="SeededOrder"/>;
/// the collections and the tests inside a class are shuffled by the orderers), and the run's databases are dropped
/// once every collection has finished (<see cref="TestRun.ShutdownAsync"/>), before xUnit reports the end.
/// </summary>
public sealed class IntegrationTestFramework(IMessageSink messageSink) : XunitTestFramework(messageSink)
{
    protected override ITestFrameworkExecutor CreateExecutor(AssemblyName assemblyName) =>
        new Executor(assemblyName, SourceInformationProvider, DiagnosticMessageSink);

    private sealed class Executor(AssemblyName assemblyName, ISourceInformationProvider sourceInformationProvider,
        IMessageSink diagnosticMessageSink) : XunitTestFrameworkExecutor(assemblyName, sourceInformationProvider, diagnosticMessageSink)
    {
        protected override async void RunTestCases(IEnumerable<IXunitTestCase> testCases, IMessageSink executionMessageSink,
            ITestFrameworkExecutionOptions executionOptions)
        {
            // Classes run in the order of their first test case inside a collection
            var shuffled = SeededOrder.Shuffle(testCases, t => t.UniqueID, "classes")
                .GroupBy(t => t.TestMethod.TestClass.Class.Name)
                .SelectMany(g => g)
                .ToList();
            using var runner = new AssemblyRunner(TestAssembly, shuffled, DiagnosticMessageSink, executionMessageSink, executionOptions);
            await runner.RunAsync();
        }
    }

    private sealed class AssemblyRunner(ITestAssembly testAssembly, IEnumerable<IXunitTestCase> testCases,
        IMessageSink diagnosticMessageSink, IMessageSink executionMessageSink, ITestFrameworkExecutionOptions executionOptions)
        : XunitTestAssemblyRunner(testAssembly, testCases, diagnosticMessageSink, executionMessageSink, executionOptions)
    {
        protected override Task AfterTestAssemblyStartingAsync()
        {
            DiagnosticMessageSink.OnMessage(new DiagnosticMessage(
                $"ClinicHub integration tests: run '{TestRun.Id}', seed {(SeededOrder.Seed?.ToString() ?? "none (xUnit order)")}"));
            return base.AfterTestAssemblyStartingAsync();
        }

        protected override async Task BeforeTestAssemblyFinishedAsync()
        {
            try
            {
                await TestRun.ShutdownAsync();
            }
            catch (Exception e)
            {
                // The next run drops what is left (its run is gone); never fail the results for it
                DiagnosticMessageSink.OnMessage(new DiagnosticMessage($"Test databases not dropped: {e.Message}"));
            }
            await base.BeforeTestAssemblyFinishedAsync();
        }
    }
}
