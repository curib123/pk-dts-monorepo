<section>
    <div class="page-heading">
        <div><h1><?= dts_escape($pageTitle) ?></h1></div>
        <?php if (!empty($createUrl)): ?>
            <a class="button" href="<?= dts_escape($createUrl) ?>">Add <?= dts_escape(strtolower($entityLabel)) ?></a>
        <?php endif; ?>
    </div>
    <div class="table-wrap">
        <table>
            <thead><tr><?php foreach ($columns as $label): ?><th><?= dts_escape($label) ?></th><?php endforeach; ?><th></th></tr></thead>
            <tbody>
            <?php foreach ($items as $row): ?>
                <?php
                $primaryId = null;
                foreach (array('area_id','specific_id','sequence_id','asset_id','location_id','softcopy_category_id') as $idKey) {
                    if (isset($row[$idKey])) {
                        $primaryId = (string) $row[$idKey];
                        break;
                    }
                }
                ?>
                <tr>
                    <?php foreach ($columns as $key => $label): ?>
                        <td><?php $value = $row[$key] ?? '—'; if (is_bool($value)) $value = $value ? 'Yes' : 'No'; ?><?= dts_escape($value) ?></td>
                    <?php endforeach; ?>
                    <td><?php if ($primaryId !== null): ?><a href="<?= dts_escape(site_url($viewBase . $primaryId)) ?>">View</a><?php endif; ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</section>
