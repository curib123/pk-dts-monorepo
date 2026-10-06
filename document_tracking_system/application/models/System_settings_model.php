<?php
defined('BASEPATH') OR exit('No direct script access allowed');
class System_settings_model extends MY_Model
{
    public function __construct(){parent::__construct();$this->load->database();}
    public function appearance():array
    {
        $row=$this->db->where('id',1)->get('system_appearance_settings')->row_array();
        if(!$row)return array('themeScope'=>'device','colorMode'=>'light','colorTheme'=>'default');
        $extra=!empty($row['settings_json'])?json_decode($row['settings_json'],true):array();if(!is_array($extra))$extra=array();
        return array_merge($extra,array('themeScope'=>$row['theme_scope'],'colorMode'=>$row['color_mode'],'colorTheme'=>$row['color_theme']));
    }
    public function update_appearance(array $data):array
    {
        $scope=(string)($data['themeScope']??'device');$mode=(string)($data['colorMode']??'light');$theme=trim((string)($data['colorTheme']??'default'));
        if(!in_array($scope,array('shared','device'),true)||!in_array($mode,array('light','dark'),true)||$theme===''||strlen($theme)>30)throw new InvalidArgumentException('Invalid appearance settings.');
        $payload=$data;$payload['themeScope']=$scope;$payload['colorMode']=$mode;$payload['colorTheme']=$theme;$row=array('id'=>1,'theme_scope'=>$scope,'color_mode'=>$mode,'color_theme'=>$theme,'settings_json'=>json_encode($payload),'updated_at'=>date('Y-m-d H:i:s'));
        if($this->db->where('id',1)->count_all_results('system_appearance_settings'))$this->db->where('id',1)->update('system_appearance_settings',$row);else $this->db->insert('system_appearance_settings',$row);
        return $payload;
    }
}
