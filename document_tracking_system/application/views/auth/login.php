<section class="auth-card">
    <h1>Sign in</h1>
    <p>Use your PK DTS username and password.</p>
    <form method="post" action="<?= dts_escape(site_url('auth/login')) ?>">
        <label>Username
            <input name="username" type="text" maxlength="150" autocomplete="username" required>
        </label>
        <label>Password
            <input name="password" type="password" maxlength="255" autocomplete="current-password" required>
        </label>
        <button type="submit">Sign in</button>
    </form>
</section>
