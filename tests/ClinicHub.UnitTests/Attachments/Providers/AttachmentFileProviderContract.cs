using ClinicHub.Application.Features.Attachments.Files;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments.Providers;

/// <summary>
/// The contract any file provider must pass (docs/design/attachments.md § 3, ATT-133, ATT-145, ATT-160 to ATT-166). A later provider (S3…) inherits
/// this class and supplies a fresh store per test.
/// </summary>
[Trait("Area", "attachments")]
public abstract class AttachmentFileProviderContract
{
    /// <summary>Bigger than any copy buffer, so a write that breaks midway has really written something.</summary>
    private const int ContentLength = 400_000;

    private const int BreaksAfter = 250_000;

    protected abstract IAttachmentFileProvider Provider { get; }

    /// <summary>Every stored file of this test's store, so a stray one under another name is noticed.</summary>
    protected abstract IReadOnlyList<string> StoredFiles();

    /// <summary>Everything this test's store and its surroundings hold, folders too: a refused key creates nothing at all.</summary>
    protected abstract IReadOnlyList<string> EverythingOnTheStore();

    private static string NewKey(string folder = "clinics/12") => $"{folder}/{Guid.NewGuid():D}";

    private static byte[] Content(byte seed = 1)
    {
        var bytes = new byte[ContentLength];
        for (var i = 0; i < bytes.Length; i++) bytes[i] = (byte)(i * 31 + seed);
        return bytes;
    }

    /// <summary>An async wrapper, so a provider that refuses before its first <c>await</c> counts the same as one that refuses after it.</summary>
    private static Task<TException> Throws<TException>(Func<Task> call) where TException : Exception =>
        Should.ThrowAsync<TException>(async () => await call());

    /// <summary>Compared whole, without printing 400 KB when it fails.</summary>
    private static void ShouldBeTheSameBytes(byte[] actual, byte[] expected) =>
        actual.AsSpan().SequenceEqual(expected).ShouldBeTrue($"{actual.Length} bytes read, {expected.Length} expected, or the same length with other bytes");

    private async Task StoredShouldBe(string key, byte[] expected)
    {
        await using var stream = await Provider.OpenReadAsync(key);
        stream.ShouldNotBeNull($"no file under {key}");
        ShouldBeTheSameBytes(await ReadAll(stream), expected);
    }

    private static async Task<byte[]> ReadAll(Stream stream)
    {
        using var copy = new MemoryStream();
        await stream.CopyToAsync(copy);
        return copy.ToArray();
    }

    // ---- ATT-160 ----

    [Theory]
    [Trait("Case", "ATT-160")]
    [InlineData("clinics/12")]
    [InlineData("platform")]
    [InlineData("a/b/c/d")]
    public async Task A_save_then_an_open_gives_back_the_same_bytes_with_the_folders_created_as_needed(string folder)
    {
        var key = NewKey(folder);

        await Provider.SaveAsync(key, new MemoryStream(Content()));

        await StoredShouldBe(key, Content());
    }

    [Fact]
    [Trait("Case", "ATT-160")]
    public async Task Files_under_one_folder_keep_apart()
    {
        var first = NewKey();
        var second = NewKey();

        await Provider.SaveAsync(first, new MemoryStream(Content(seed: 1)));
        await Provider.SaveAsync(second, new MemoryStream(Content(seed: 2)));

        await StoredShouldBe(first, Content(seed: 1));
        await StoredShouldBe(second, Content(seed: 2));
    }

    [Fact]
    [Trait("Case", "ATT-160")]
    public async Task An_empty_stream_saves_an_empty_file()
    {
        var key = NewKey();

        await Provider.SaveAsync(key, new MemoryStream());

        await StoredShouldBe(key, []);
    }

    // ---- ATT-161 ----

    [Fact]
    [Trait("Case", "ATT-161")]
    public async Task An_unknown_key_in_a_folder_that_does_not_exist_opens_as_null()
    {
        (await Provider.OpenReadAsync(NewKey("clinics/99"))).ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "ATT-161")]
    public async Task An_unknown_key_in_a_folder_that_exists_opens_as_null()
    {
        await Provider.SaveAsync(NewKey(), new MemoryStream(Content()));

        (await Provider.OpenReadAsync(NewKey())).ShouldBeNull();
    }

    // ---- ATT-162: a failed write ----

    [Fact]
    [Trait("Case", "ATT-162")]
    public async Task A_write_that_fails_midway_throws_and_leaves_no_file()
    {
        var key = NewKey();

        await Throws<ReadBrokeException>(() => Provider.SaveAsync(key, new StreamFailingAfter(Content(), BreaksAfter)));

        (await Provider.OpenReadAsync(key)).ShouldBeNull();
        StoredFiles().ShouldBeEmpty("nothing, under any name");
    }

    [Fact]
    [Trait("Case", "ATT-162")]
    public async Task A_write_that_fails_at_its_first_byte_leaves_no_file()
    {
        var key = NewKey();

        await Throws<ReadBrokeException>(() => Provider.SaveAsync(key, new StreamFailingAfter(Content(), 0)));

        (await Provider.OpenReadAsync(key)).ShouldBeNull();
        StoredFiles().ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-162")]
    public async Task After_a_failed_write_the_same_key_can_be_saved_whole()
    {
        var key = NewKey();
        await Throws<ReadBrokeException>(() => Provider.SaveAsync(key, new StreamFailingAfter(Content(), BreaksAfter)));

        await Provider.SaveAsync(key, new MemoryStream(Content()));

        await StoredShouldBe(key, Content());
    }

    [Fact]
    [Trait("Case", "ATT-162")]
    public async Task A_failed_write_leaves_the_other_files_alone()
    {
        var other = NewKey();
        await Provider.SaveAsync(other, new MemoryStream(Content(seed: 2)));

        await Throws<ReadBrokeException>(() => Provider.SaveAsync(NewKey(), new StreamFailingAfter(Content(), BreaksAfter)));

        await StoredShouldBe(other, Content(seed: 2));
        StoredFiles().Count.ShouldBe(1);
    }

    // ---- ATT-133: a cancelled write ----

    [Fact]
    [Trait("Case", "ATT-133")]
    public async Task A_cancel_during_the_write_stops_it_and_leaves_no_file()
    {
        var key = NewKey();
        using var request = new CancellationTokenSource();

        await Throws<OperationCanceledException>(() =>
            Provider.SaveAsync(key, new StreamCancellingAfter(Content(), BreaksAfter, request), request.Token));

        (await Provider.OpenReadAsync(key)).ShouldBeNull();
        StoredFiles().ShouldBeEmpty("nothing, under any name");
    }

    [Fact]
    [Trait("Case", "ATT-133")]
    public async Task A_request_already_cancelled_writes_nothing()
    {
        var key = NewKey();
        using var request = new CancellationTokenSource();
        await request.CancelAsync();

        await Throws<OperationCanceledException>(() => Provider.SaveAsync(key, new MemoryStream(Content()), request.Token));

        (await Provider.OpenReadAsync(key)).ShouldBeNull();
        StoredFiles().ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-133")]
    public async Task After_a_cancelled_write_the_same_key_can_be_saved_whole()
    {
        var key = NewKey();
        using var request = new CancellationTokenSource();
        await Throws<OperationCanceledException>(() =>
            Provider.SaveAsync(key, new StreamCancellingAfter(Content(), BreaksAfter, request), request.Token));

        await Provider.SaveAsync(key, new MemoryStream(Content()));

        await StoredShouldBe(key, Content());
    }

    // ---- ATT-145 ----

    [Fact]
    [Trait("Case", "ATT-145")]
    public async Task Two_opens_at_once_both_read_the_whole_file()
    {
        var key = NewKey();
        var content = Content();
        await Provider.SaveAsync(key, new MemoryStream(content));

        await using var first = await Provider.OpenReadAsync(key);
        await using var second = await Provider.OpenReadAsync(key);

        var firstStart = new byte[1000];
        await first.ReadExactlyAsync(firstStart);
        var secondWhole = await ReadAll(second);
        var firstRest = await ReadAll(first);

        ShouldBeTheSameBytes(secondWhole, content);
        ShouldBeTheSameBytes([.. firstStart, .. firstRest], content);
    }

    [Fact]
    [Trait("Case", "ATT-145")]
    public async Task After_the_opens_are_disposed_the_file_is_not_locked()
    {
        var key = NewKey();
        await Provider.SaveAsync(key, new MemoryStream(Content()));
        var first = await Provider.OpenReadAsync(key);
        var second = await Provider.OpenReadAsync(key);
        await first.DisposeAsync();
        await second.DisposeAsync();

        await Provider.DeleteAsync(key);

        (await Provider.OpenReadAsync(key)).ShouldBeNull();
    }

    // ---- ATT-163: a bad key ----

    public static TheoryData<string> BadKeys =>
    [
        @"..\x", "../x", "a/../../x", "C:x", @"\\s\x", "x:ads", "CON", "x.", "Clinics/1/x", "clinics/1/X", "",
        null, "/x", "x/", "a//b", @"a\b", "a b", "a.b", "..", ".", "a/./b", "ملف", "a%2fb", "a_b", "a\0b", "a\nb",
    ];

    [Theory]
    [Trait("Case", "ATT-163")]
    [MemberData(nameof(BadKeys))]
    public async Task A_bad_key_is_refused_by_save_before_touching_the_store_or_the_content(string key)
    {
        var before = EverythingOnTheStore();

        await Throws<ArgumentException>(() => Provider.SaveAsync(key, new StreamFailingAfter(Content(), 0)));

        EverythingOnTheStore().ShouldBe(before);
    }

    [Theory]
    [Trait("Case", "ATT-163")]
    [MemberData(nameof(BadKeys))]
    public async Task A_bad_key_is_refused_by_open_and_by_delete(string key)
    {
        var before = EverythingOnTheStore();

        await Throws<ArgumentException>(() => Provider.OpenReadAsync(key));
        await Throws<ArgumentException>(() => Provider.DeleteAsync(key));

        EverythingOnTheStore().ShouldBe(before);
    }

    // ---- ATT-164 ----

    [Fact]
    [Trait("Case", "ATT-164")]
    public async Task A_delete_of_an_unknown_key_in_a_folder_that_does_not_exist_is_no_error()
    {
        await Provider.DeleteAsync(NewKey("clinics/99"));

        StoredFiles().ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-164")]
    public async Task A_delete_of_an_unknown_key_leaves_the_other_files_alone()
    {
        var other = NewKey();
        await Provider.SaveAsync(other, new MemoryStream(Content()));

        await Provider.DeleteAsync(NewKey());

        await StoredShouldBe(other, Content());
    }

    // ---- ATT-166 ----

    [Fact]
    [Trait("Case", "ATT-166")]
    public async Task A_save_to_an_existing_key_throws_and_the_first_files_bytes_survive()
    {
        var key = NewKey();
        await Provider.SaveAsync(key, new MemoryStream(Content(seed: 1)));

        await Throws<Exception>(() => Provider.SaveAsync(key, new MemoryStream(Content(seed: 2))));

        await StoredShouldBe(key, Content(seed: 1));
    }

    [Fact]
    [Trait("Case", "ATT-166")]
    public async Task A_shorter_second_file_does_not_truncate_the_first()
    {
        var key = NewKey();
        await Provider.SaveAsync(key, new MemoryStream(Content(seed: 1)));

        await Throws<Exception>(() => Provider.SaveAsync(key, new MemoryStream([1, 2, 3])));

        await StoredShouldBe(key, Content(seed: 1));
    }

    [Fact]
    [Trait("Case", "ATT-166")]
    public async Task The_cleanup_of_a_refused_second_write_does_not_remove_the_first_file()
    {
        var key = NewKey();
        await Provider.SaveAsync(key, new MemoryStream(Content(seed: 1)));

        await Throws<Exception>(() => Provider.SaveAsync(key, new StreamFailingAfter(Content(seed: 2), BreaksAfter)));

        await StoredShouldBe(key, Content(seed: 1));
        StoredFiles().Count.ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "ATT-166")]
    public async Task A_cancelled_request_on_an_existing_key_does_not_remove_the_first_file()
    {
        var key = NewKey();
        await Provider.SaveAsync(key, new MemoryStream(Content(seed: 1)));
        using var request = new CancellationTokenSource();
        await request.CancelAsync();

        await Throws<Exception>(() => Provider.SaveAsync(key, new MemoryStream(Content(seed: 2)), request.Token));

        await StoredShouldBe(key, Content(seed: 1));
    }
}
