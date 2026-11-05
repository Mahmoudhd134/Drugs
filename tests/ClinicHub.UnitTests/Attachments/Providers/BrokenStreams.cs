namespace ClinicHub.UnitTests.Attachments.Providers;

/// <summary>Thrown by <see cref="StreamFailingAfter"/>: a read that broke midway.</summary>
public sealed class ReadBrokeException() : Exception("The read broke midway.");

/// <summary>Delivers its first bytes, then calls <see cref="AtTheLimit"/> before each later read; seekable and of a real length, like an upload's stream.</summary>
public abstract class StreamActingAfter(byte[] content, int goodBytes) : Stream
{
    private int position;

    protected abstract void AtTheLimit();

    private int Deliver(Span<byte> buffer)
    {
        if (position >= goodBytes) AtTheLimit();
        var left = content.Length - position;
        var beforeTheLimit = position < goodBytes ? goodBytes - position : left;
        var count = Math.Min(buffer.Length, Math.Min(left, beforeTheLimit));
        content.AsSpan(position, count).CopyTo(buffer);
        position += count;
        return count;
    }

    public override bool CanRead => true;
    public override bool CanSeek => true;
    public override bool CanWrite => false;
    public override long Length => content.Length;

    public override long Position
    {
        get => position;
        set => position = (int)value;
    }

    public override int Read(byte[] buffer, int offset, int count) => Deliver(buffer.AsSpan(offset, count));

    public override int Read(Span<byte> buffer) => Deliver(buffer);

    public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken ct)
    {
        await Task.Yield();
        ct.ThrowIfCancellationRequested();
        return Deliver(buffer.AsSpan(offset, count));
    }

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken ct = default)
    {
        await Task.Yield();
        ct.ThrowIfCancellationRequested();
        return Deliver(buffer.Span);
    }

    public override long Seek(long offset, SeekOrigin origin)
    {
        position = origin switch
        {
            SeekOrigin.Begin => (int)offset,
            SeekOrigin.Current => position + (int)offset,
            _ => content.Length + (int)offset,
        };
        return position;
    }

    public override void Flush() { }
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}

/// <summary>A disk or network failure partway through the content.</summary>
public sealed class StreamFailingAfter(byte[] content, int goodBytes) : StreamActingAfter(content, goodBytes)
{
    protected override void AtTheLimit() => throw new ReadBrokeException();
}

/// <summary>Delivers its first bytes, then throws the given exception: a body whose read fails midway for a named reason.</summary>
public sealed class StreamThrowingAfter(byte[] content, int goodBytes, Exception failure) : StreamActingAfter(content, goodBytes)
{
    protected override void AtTheLimit() => throw failure;
}

/// <summary>
/// The request is cancelled partway through the content: the source keeps delivering, as a client's stream might, so only a provider that passes on
/// and honors its token stops. A provider ignoring it would finish the file.
/// </summary>
public sealed class StreamCancellingAfter(byte[] content, int goodBytes, CancellationTokenSource request) : StreamActingAfter(content, goodBytes)
{
    protected override void AtTheLimit() => request.Cancel();
}
