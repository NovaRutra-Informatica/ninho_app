using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Ninho.Licensing;

namespace Ninho.LicenseServer;

public static class LicenseHttpHost
{
    public static WebApplication Create(LicenseStore store, Action<WebApplicationBuilder>? configure = null)
    {
        var builder = WebApplication.CreateBuilder([]);
        builder.Logging.ClearProviders(); // No request URL, body, code, token, key, or address logs.
        builder.WebHost.ConfigureKestrel(options => { options.AddServerHeader = false; options.Limits.MaxRequestBodySize = 4096; options.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(10); });
        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.CreateChained(
                PartitionedRateLimiter.Create<HttpContext, string>(_ => RateLimitPartition.GetConcurrencyLimiter("all", _ => new ConcurrencyLimiterOptions { PermitLimit = 8, QueueLimit = 0 })),
                PartitionedRateLimiter.Create<HttpContext, string>(_ => RateLimitPartition.GetFixedWindowLimiter("all", _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })));
        });
        configure?.Invoke(builder);
        var app = builder.Build();
        app.Use(async (context, next) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            if (!context.Request.IsHttps) { context.Response.StatusCode = StatusCodes.Status400BadRequest; return; }
            try { await next(context); }
            catch (Exception) when (!context.Response.HasStarted)
            {
                context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                await context.Response.WriteAsJsonAsync(new { error = "service_unavailable" });
            }
        });
        app.UseRateLimiter();
        app.MapPost("/v1/activate", async (HttpContext context) =>
        {
            if (context.Request.ContentLength > 4096 || !context.Request.HasJsonContentType()) return Results.BadRequest(new { error = "invalid_request" });
            ActivationRequest request;
            try
            {
                var buffer = new byte[4097];
                var length = await context.Request.Body.ReadAtLeastAsync(buffer, 4097, false, context.RequestAborted);
                if (length > 4096) return Results.BadRequest(new { error = "invalid_request" });
                request = OperatorProgram.ParseRequest(buffer.AsSpan(0, length));
            }
            catch (Exception exception) when (exception is JsonException or InvalidDataException or BadHttpRequestException) { return Results.BadRequest(new { error = "invalid_request" }); }
            var result = await store.ActivateAsync(request, context.RequestAborted);
            return result.Error switch
            {
                ActivationError.None => Results.Json(new ActivationResponse(result.Token!), LicenseProtocol.JsonOptions),
                ActivationError.NoSeats => Results.Conflict(new { error = "activation_limit" }),
                _ => Results.BadRequest(new { error = "invalid_activation" })
            };
        });
        return app;
    }
}
