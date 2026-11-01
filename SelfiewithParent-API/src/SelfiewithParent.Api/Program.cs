using System.Reflection;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Options;
using SelfiewithParent.Api.Reminders;
using SelfiewithParent.Api.Security;

var builder = WebApplication.CreateBuilder(args);
var isDev = builder.Environment.IsDevelopment();

// Clear start-up message when secrets are missing (user-secrets are only loaded in the Development environment)
if (string.IsNullOrWhiteSpace(builder.Configuration["Jwt:SigningKey"]) || string.IsNullOrWhiteSpace(builder.Configuration["Otp:HashKey"]))
{
    var secretsId = typeof(Program).Assembly.GetCustomAttribute<Microsoft.Extensions.Configuration.UserSecrets.UserSecretsIdAttribute>()?.UserSecretsId;
    var secretsPath = secretsId is null ? "(no UserSecretsId in this build)"
        : Microsoft.Extensions.Configuration.UserSecrets.PathHelper.GetSecretsPathFromSecretsId(secretsId);
    throw new InvalidOperationException(
        $"Secrets Jwt:SigningKey / Otp:HashKey are missing. Running in environment '{builder.Environment.EnvironmentName}'. " +
        (isDev
            ? $"User-secrets looked in '{secretsPath}' (file exists: {File.Exists(secretsPath)}; APPDATA='{Environment.GetEnvironmentVariable("APPDATA")}'; " +
              $"Windows user='{Environment.UserDomainName}\\{Environment.UserName}')."
            : "User-secrets are only loaded in 'Development': start with the 'http' or 'https' launch profile, or set ASPNETCORE_ENVIRONMENT=Development. " +
              "Outside development, supply them from Azure Key Vault / app settings."));
}

// ---------- Web server hardening ----------
builder.WebHost.ConfigureKestrel(k =>
{
    k.AddServerHeader = false;                       // don't advertise the server software
    k.Limits.MaxRequestBodySize = 64 * 1024;         // 64 KB: no endpoint needs more yet (uploads will get their own limit)
    k.Limits.MaxRequestHeadersTotalSize = 16 * 1024;
});

// ---------- Settings (validated at start-up: the API refuses to run with missing secrets) ----------
builder.Services.AddOptions<JwtOptions>().Bind(builder.Configuration.GetSection(JwtOptions.Section)).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<OtpOptions>().Bind(builder.Configuration.GetSection(OtpOptions.Section)).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<CorsOptions>().Bind(builder.Configuration.GetSection(CorsOptions.Section));
builder.Services.AddOptions<GoogleAuthOptions>().Bind(builder.Configuration.GetSection(GoogleAuthOptions.Section));
builder.Services.AddOptions<SmtpOptions>().Bind(builder.Configuration.GetSection(SmtpOptions.Section)).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<RemindersOptions>().Bind(builder.Configuration.GetSection(RemindersOptions.Section)).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<SelfiewithParent.Api.Controllers.ReelsOptions>().Bind(builder.Configuration.GetSection(SelfiewithParent.Api.Controllers.ReelsOptions.Section));

// ---------- Services ----------
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddDistributedMemoryCache();        // production: replace with Redis (shared across servers, survives restarts)
builder.Services.AddSingleton<SqlConnectionFactory>();
builder.Services.AddSingleton<UserRepository>();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<MenuRepository>();
builder.Services.AddSingleton<ContentRepository>();
builder.Services.AddSingleton<SelfieRepository>();
builder.Services.AddSingleton<ParentStoryRepository>();
// Giving: the Support page, campaigns, donations through Razorpay (keys from the secret store / environment, never source control)
builder.Services.AddSingleton<GivingRepository>();
builder.Services.AddSingleton<FeatureRepository>();
builder.Services.AddSingleton<GratitudeRepository>();
builder.Services.AddSingleton<AlbumRepository>();
builder.Services.Configure<SelfiewithParent.Api.Giving.RazorpayOptions>(builder.Configuration.GetSection("Razorpay"));
builder.Services.AddHttpClient<SelfiewithParent.Api.Giving.RazorpayGateway>(c => c.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddSingleton<SelfiewithParent.Api.Giving.DonationReceipts>();
builder.Services.AddSingleton<EngagementRepository>();
builder.Services.AddSingleton<ContactRepository>();
builder.Services.AddSingleton<HomeRepository>();
// Family date reminders and the yearly Then & Now nudge: emailed once a day by a background job
builder.Services.AddSingleton<ReminderLinks>();
builder.Services.AddSingleton<ReminderEmails>();
builder.Services.AddSingleton<ReminderJob>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<ReminderJob>());
// Photo of the Week / festival contests: decided and winners emailed by a background job
builder.Services.AddSingleton<ContestJob>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<ContestJob>());
// Festival peaks: anonymous public reads are cached for a short time (see PublicCache)
builder.Services.AddOutputCache(PublicCache.AddPolicies);
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton<OtpService>();
// Code senders: development writes codes to the console; elsewhere they refuse until real providers are connected.
// Email goes out through Gmail SMTP as soon as Email:Smtp:Username / Password are set (any environment).
builder.Services.AddSingleton<DevelopmentOtpSender>();
builder.Services.AddSingleton<NotConfiguredOtpSender>();
builder.Services.AddSingleton<SmtpMailer>();
builder.Services.AddSingleton<SmtpEmailCodeSender>();
builder.Services.AddSingleton<AccountNoticeSender>();
builder.Services.AddSingleton<IOtpSender>(sp => isDev
    ? sp.GetRequiredService<DevelopmentOtpSender>()
    : sp.GetRequiredService<NotConfiguredOtpSender>());     // replace with the SMS / WhatsApp provider
var smtpConfigured = builder.Configuration.GetSection(SmtpOptions.Section).Get<SmtpOptions>()?.IsConfigured == true;
builder.Services.AddSingleton<IEmailCodeSender>(sp => smtpConfigured ? sp.GetRequiredService<SmtpEmailCodeSender>()
    : isDev ? sp.GetRequiredService<DevelopmentOtpSender>()
    : sp.GetRequiredService<NotConfiguredOtpSender>());

builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");
builder.Services.AddHsts(o => { o.MaxAge = TimeSpan.FromDays(365); o.IncludeSubDomains = true; o.Preload = true; });

// ---------- Authentication: signed, short-lived JWTs, checked against the sign-out list ----------
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((o, jwt) =>
    {
        o.MapInboundClaims = false;
        o.RequireHttpsMetadata = !isDev;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Value.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Value.Audience,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            RequireSignedTokens = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = TokenService.CreateSigningKey(jwt.Value),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],   // blocks "alg: none" and algorithm-swap attacks
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = JwtRegisteredClaimNames.Sub,
            RoleClaimType = "role"
        };
        o.Events = new JwtBearerEvents
        {
            OnTokenValidated = async ctx =>
            {
                var tokens = ctx.HttpContext.RequestServices.GetRequiredService<TokenService>();
                var ct = ctx.HttpContext.RequestAborted;
                var jti = ctx.Principal?.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
                if (jti is null || await tokens.IsAccessTokenRevokedAsync(jti, ct)) { ctx.Fail("Token has been revoked."); return; }

                if (long.TryParse(ctx.Principal!.FindFirst(AppClaims.UserId)?.Value, out var uid)
                    && ctx.SecurityToken is JsonWebToken token
                    && await tokens.IsUserRevokedSinceAsync(uid, token.IssuedAt, ct))
                {
                    ctx.Fail("All sessions for this account were signed out.");
                }
            }
        };
    });

// ---------- Authorisation: secure by default — every endpoint needs a signed-in user unless marked [AllowAnonymous] ----------
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
    .AddPolicy(Policies.Staff, p => p.RequireAuthenticatedUser().RequireRole(AppRoles.Staff))
    .AddPolicy(Policies.SuperAdmin, p => p.RequireAuthenticatedUser().RequireRole(AppRoles.SuperAdmin))
    .AddPolicy(Policies.ContentEditor, p => p.RequireAuthenticatedUser().RequireRole(AppRoles.ContentEditors))
    .AddPolicy(Policies.Reviewer, p => p.RequireAuthenticatedUser().RequireRole(AppRoles.Reviewers));

// ---------- Rate limiting (per client IP) ----------
// Behind a load balancer / Azure Front Door, configure ForwardedHeaders so this sees the real client IP.
static string ClientIp(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
static RateLimitPartition<string> Fixed(HttpContext ctx, int permits, TimeSpan window) =>
    RateLimitPartition.GetFixedWindowLimiter(ClientIp(ctx), _ => new FixedWindowRateLimiterOptions
    { PermitLimit = permits, Window = window, QueueLimit = 0 });

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        // Public content (menus, pages, images) has its own, larger limit: every page view reads it, from the browser and
        // from the website's server, which sends every visitor's server render from one address
        ctx.GetEndpoint()?.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName == RateLimits.PublicContent
            ? RateLimitPartition.GetNoLimiter("public-content")
            : Fixed(ctx, 120, TimeSpan.FromMinutes(1)));
    o.AddPolicy(RateLimits.OtpRequest, ctx => Fixed(ctx, 5, TimeSpan.FromMinutes(15)));
    o.AddPolicy(RateLimits.OtpVerify, ctx => Fixed(ctx, 10, TimeSpan.FromMinutes(15)));
    o.AddPolicy(RateLimits.Auth, ctx => Fixed(ctx, 20, TimeSpan.FromMinutes(5)));
    o.AddPolicy(RateLimits.Password, ctx => Fixed(ctx, 10, TimeSpan.FromMinutes(15)));
    o.AddPolicy(RateLimits.PublicContent, ctx => Fixed(ctx, 1200, TimeSpan.FromMinutes(1)));
    o.AddPolicy(RateLimits.Upload, ctx => Fixed(ctx, 20, TimeSpan.FromMinutes(15)));
    o.OnRejected = async (ctx, ct) =>
    {
        if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
            ctx.HttpContext.Response.Headers.RetryAfter = ((int)retry.TotalSeconds).ToString();
        await ctx.HttpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = StatusCodes.Status429TooManyRequests,
            Title = "Too many requests. Please wait a moment and try again."
        }, ct);
    };
});

// ---------- CORS: only the Selfie with Parent websites may call the API from a browser ----------
var allowedOrigins = builder.Configuration.GetSection(CorsOptions.Section).Get<CorsOptions>()?.AllowedOrigins ?? [];
builder.Services.AddCors(o => o.AddPolicy("sites", p => p
    .WithOrigins(allowedOrigins)
    .WithMethods("GET", "POST", "PUT", "DELETE")
    .WithHeaders("Authorization", "Content-Type")
    .SetPreflightMaxAge(TimeSpan.FromMinutes(10))));      // no cookies → no AllowCredentials

// ---------- Swagger (switched on per environment; off by default) ----------
var swaggerEnabled = builder.Configuration.GetValue<bool>("Swagger:Enabled");
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Selfie with Parent API",
        Version = "v1",
        Description = "Accounts and roles for Selfie with Parent. Sign in with /auth/otp/request → /auth/otp/verify, then click **Authorize** and paste the access token."
    });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Access token from /api/v1/auth/otp/verify (paste the token only, without 'Bearer')."
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } }] = []
    });
    var xml = Path.Combine(AppContext.BaseDirectory, $"{Assembly.GetExecutingAssembly().GetName().Name}.xml");
    if (File.Exists(xml)) c.IncludeXmlComments(xml);
});

var app = builder.Build();

app.Logger.LogInformation("Email sign-in codes: {Sender}", smtpConfigured
    ? $"sent by SMTP ({app.Services.GetRequiredService<IOptions<SmtpOptions>>().Value.Host})"
    : isDev ? "written to this console (development; set the Gmail secrets to send real email)" : "NOT configured — email sign-in is off");

// ---------- Pipeline ----------
app.UseExceptionHandler();                  // unhandled errors → generic problem response, no stack traces
app.UseStatusCodePages();
if (!isDev)
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.UseMiddleware<SecurityHeadersMiddleware>();

if (swaggerEnabled)
{
    app.UseSwagger();
    app.UseSwaggerUI(o =>
    {
        o.SwaggerEndpoint("/swagger/v1/swagger.json", "Selfie with Parent API v1");
        o.DocumentTitle = "Selfie with Parent API";
    });
}

app.UseRouting();
app.UseCors("sites");                 // before the rate limiter, so a 429 reaches the websites as a 429 (not a CORS error)
app.UseOutputCache();                 // cached public reads are answered before the rate limiter and the database
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UsePublicCacheClearing();           // staff changes, deleted accounts, shared frames: public pages show them at once

app.MapControllers();
app.MapHealthChecks("/health").AllowAnonymous();

app.Run();
