<section>
    <div class="page-heading"><div><h1>Users</h1><p>Manage DTS accounts and role assignments.</p></div><a class="button" href="<?= dts_escape(site_url('users/create')) ?>">Add user</a></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Position</th><th></th></tr></thead><tbody>
    <?php foreach (($result['items'] ?? array()) as $user): ?><tr><td><?= dts_escape(trim($user['firstname'].' '.$user['lastname'])) ?></td><td><?= dts_escape($user['username']) ?></td><td><?= dts_escape($user['role_name']) ?></td><td><?= dts_escape($user['position_title'] ?? '—') ?></td><td><a href="<?= dts_escape(site_url('users/view/'.$user['user_id'])) ?>">View</a></td></tr><?php endforeach; ?>
    </tbody></table></div>
</section>
