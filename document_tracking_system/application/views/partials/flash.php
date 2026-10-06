<?php
$error = $this->session->flashdata('error');
$success = $this->session->flashdata('success');
?>
<?php if ($error): ?>
    <div class="alert alert-error" role="alert"><?= dts_escape($error) ?></div>
<?php endif; ?>
<?php if ($success): ?>
    <div class="alert alert-success" role="status"><?= dts_escape($success) ?></div>
<?php endif; ?>
