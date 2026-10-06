<?php
declare(strict_types=1);
$root=dirname(__DIR__);
$required=[
 $root.'/application/helpers/dts_location_code_helper.php',
 $root.'/application/models/Storage_master_model.php',
 $root.'/application/models/Softcopy_category_model.php',
 $root.'/application/models/System_settings_model.php',
 $root.'/application/controllers/Areas.php',
 $root.'/application/controllers/Specifics.php',
 $root.'/application/controllers/Locations.php',
 $root.'/application/controllers/Sequences.php',
 $root.'/application/controllers/Asset_numbers.php',
 $root.'/application/controllers/Softcopy_categories.php',
 $root.'/application/controllers/System_settings.php',
];
foreach($required as $file){if(!is_file($file)){fwrite(STDERR,'FAIL missing '.basename($file).PHP_EOL);exit(1);}}
define('BASEPATH',$root.'/system/'); require_once $required[0];
function m_assert($c,string $m):void{if(!$c){fwrite(STDERR,"FAIL $m\n");exit(1);}}
m_assert(dts_numeric_to_location_code(1)==='A','1 -> A');
m_assert(dts_numeric_to_location_code(26)==='Z','26 -> Z');
m_assert(dts_numeric_to_location_code(27)==='AA','27 -> AA');
m_assert(dts_location_code_to_numeric('AA')===27,'AA -> 27');
$storage=file_get_contents($root.'/application/models/Storage_master_model.php');
m_assert(strpos($storage,'system_sequence_states')!==false,'location sequence state preserved');
m_assert(strpos($storage,"is_active' => false")!==false,'location archival preserved');
m_assert(strpos($storage,'hardcopy_documents')!==false,'hardcopy routing propagation preserved');
$soft=file_get_contents($root.'/application/models/Softcopy_category_model.php');
m_assert(strpos($soft,'uncategorized')!==false,'default folder deletion protected');
m_assert(strpos($soft,'subfolders')!==false,'hierarchy deletion protected');
$settings=file_get_contents($root.'/application/models/System_settings_model.php');
m_assert(preg_match("/'themeScope'\\s*=>\\s*'device'/",$settings)===1,'appearance default scope preserved');
m_assert(preg_match("/'colorMode'\\s*=>\\s*'light'/",$settings)===1,'appearance default mode preserved');
$locationController=file_get_contents($root.'/application/controllers/Locations.php');
m_assert(strpos($locationController,'location-management.archive')!==false,'location archive permission preserved');
$settingsController=file_get_contents($root.'/application/controllers/System_settings.php');
m_assert(strpos($settingsController,'system-settings.manage')!==false,'settings manage permission preserved');
$masterIndex=file_get_contents($root.'/application/views/master/index.php');
m_assert(strpos($masterIndex,"'area_id','specific_id','sequence_id','asset_id','location_id','softcopy_category_id'")!==false,'master list uses deterministic primary id keys');
echo "PASS master_data_contract_test\n";
