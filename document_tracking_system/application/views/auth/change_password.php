<section class="auth-card">
    <h1>Change password</h1>
    <p>Your account requires a new password before you continue.</p>
    <form method="post" action="<?= dts_escape(site_url('auth/change_password')) ?>">
        <label>New password
            <input name="password" type="password" maxlength="255" autocomplete="new-password" required>
        </label>
        <label>Confirm password
            <input name="password_confirmation" type="password" maxlength="255" autocomplete="new-password" required>
        </label>
        <button type="submit">Update password</button>
    </form>
</section>
