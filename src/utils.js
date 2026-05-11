export async function withLock(ctx, fn) {
    if (ctx.locks) return;
    ctx.locks = true;
    try {
        await fn();
    } catch (error) {
        ctx.emit('error', `Impulse generator error: ${error}`);
    } finally {
        ctx.locks = false;
    }
}
