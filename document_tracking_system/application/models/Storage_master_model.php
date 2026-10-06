<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Storage_master_model extends MY_Model
{
    public function __construct()
    {
        parent::__construct();
        $this->load->database();
        $this->load->helper(array('dts_security', 'dts_location_code'));
    }

    public function areas(int $page, int $limit): array
    {
        return $this->paged('areas', 'area_name', $page, $limit, 'ASC');
    }

    public function area(string $id): ?array
    {
        $area = $this->db->where('area_id', $id)->get('areas')->row_array();
        if (!$area) return null;
        $area['specifics'] = $this->db->where('area_id', $id)->order_by('specific_name')->get('specifics')->result_array();
        return $area;
    }

    public function save_area(?string $id, string $name): string
    {
        $name = trim($name);
        if ($name === '' || strlen($name) > 150) throw new InvalidArgumentException('Area name is required.');
        if ($id === null) {
            $this->db->insert('areas', array('area_name' => $name));
            return (string) $this->db->insert_id();
        }
        $this->db->where('area_id', $id)->update('areas', array('area_name' => $name));
        return $id;
    }

    public function delete_area(string $id): void
    {
        $this->db->where('area_id', $id)->delete('areas');
    }

    public function specifics(int $page, int $limit): array
    {
        $offset = ($page - 1) * $limit;
        $total = (int) $this->db->count_all('specifics');
        $items = $this->db->select('s.*, a.area_name')->from('specifics s')->join('areas a', 'a.area_id=s.area_id', 'left')
            ->order_by('s.specific_name')->limit($limit, $offset)->get()->result_array();
        return $this->page($items, $total, $page, $limit);
    }

    public function specific(string $id): ?array
    {
        return $this->db->select('s.*, a.area_name')->from('specifics s')->join('areas a','a.area_id=s.area_id','left')->where('s.specific_id',$id)->get()->row_array() ?: null;
    }

    public function save_specific(?string $id, string $name, ?string $areaId): string
    {
        $name = trim($name);
        if ($name === '' || strlen($name) > 150) throw new InvalidArgumentException('Specific name is required.');
        $areaId = ($areaId === null || $areaId === '') ? null : dts_id_string($areaId);
        if ($id === null) {
            $this->db->insert('specifics', array('specific_name'=>$name,'area_id'=>$areaId));
            return (string) $this->db->insert_id();
        }
        $this->db->trans_start();
        $this->db->where('specific_id',$id)->update('specifics', array('specific_name'=>$name,'area_id'=>$areaId));
        if ($areaId !== null) {
            $this->db->query(
                'UPDATE hardcopy_documents h SET specific_id = ?, area_id = ? WHERE h.specific_id = ? OR h.asset_id IN (SELECT asset_id FROM asset_numbers WHERE specific_id = ?) OR h.location_id IN (SELECT location_id FROM locations WHERE specific_id = ? OR asset_id IN (SELECT asset_id FROM asset_numbers WHERE specific_id = ?))',
                array($id,$areaId,$id,$id,$id,$id)
            );
        }
        $this->db->trans_complete();
        if (!$this->db->trans_status()) throw new RuntimeException('Unable to update specific.');
        return $id;
    }

    public function delete_specific(string $id): void { $this->db->where('specific_id',$id)->delete('specifics'); }

    public function sequences(int $page, int $limit): array { return $this->paged('sequences','sequence_code',$page,$limit,'ASC'); }
    public function sequence(string $id): ?array { return $this->db->where('sequence_id',$id)->get('sequences')->row_array() ?: null; }
    public function save_sequence(?string $id,string $code): string
    {
        $code=trim($code); if($code===''||strlen($code)>50) throw new InvalidArgumentException('Sequence code is required.');
        if($id===null){$this->db->insert('sequences',array('sequence_code'=>$code));return (string)$this->db->insert_id();}
        $this->db->where('sequence_id',$id)->update('sequences',array('sequence_code'=>$code));return $id;
    }
    public function delete_sequence(string $id): void { $this->db->where('sequence_id',$id)->delete('sequences'); }

    public function assets(int $page,int $limit): array
    {
        $offset=($page-1)*$limit;$total=(int)$this->db->count_all('asset_numbers');
        $items=$this->db->select('an.*, s.specific_name, a.area_name')->from('asset_numbers an')->join('specifics s','s.specific_id=an.specific_id','left')->join('areas a','a.area_id=s.area_id','left')->order_by('an.asset_number')->limit($limit,$offset)->get()->result_array();
        return $this->page($items,$total,$page,$limit);
    }
    public function asset(string $id): ?array { return $this->db->select('an.*, s.specific_name, s.area_id, a.area_name')->from('asset_numbers an')->join('specifics s','s.specific_id=an.specific_id','left')->join('areas a','a.area_id=s.area_id','left')->where('an.asset_id',$id)->get()->row_array() ?: null; }
    public function save_asset(?string $id,string $number,?string $specificId): string
    {
        $number=trim($number);if($number===''||strlen($number)>100)throw new InvalidArgumentException('Asset number is required.');
        $specificId=($specificId===null||$specificId==='')?null:dts_id_string($specificId);
        if($id===null){$this->db->insert('asset_numbers',array('asset_number'=>$number,'specific_id'=>$specificId,'created_at'=>date('Y-m-d H:i:s')));return (string)$this->db->insert_id();}
        $this->db->trans_start();
        $this->db->where('asset_id',$id)->update('asset_numbers',array('asset_number'=>$number,'specific_id'=>$specificId));
        if($specificId!==null){
            $specific=$this->db->select('area_id')->where('specific_id',$specificId)->get('specifics')->row_array();
            if($specific && !empty($specific['area_id'])){
                $this->db->where('asset_id',$id)->update('locations',array('specific_id'=>$specificId));
                $this->db->query('UPDATE hardcopy_documents SET asset_id = ?, specific_id = ?, area_id = ? WHERE asset_id = ? OR location_id IN (SELECT location_id FROM locations WHERE asset_id = ?)',array($id,$specificId,$specific['area_id'],$id,$id));
            }
        }
        $this->db->trans_complete();if(!$this->db->trans_status())throw new RuntimeException('Unable to update asset number.');return $id;
    }
    public function delete_asset(string $id): void { $this->db->where('asset_id',$id)->delete('asset_numbers'); }

    public function locations(int $page,int $limit): array
    {
        $offset=($page-1)*$limit;$total=(int)$this->db->count_all('locations');
        $items=$this->db->select('l.*, an.asset_number, s.specific_name, a.area_name')->from('locations l')->join('asset_numbers an','an.asset_id=l.asset_id','left')->join('specifics s','s.specific_id=l.specific_id','left')->join('areas a','a.area_id=s.area_id','left')->order_by('l.location_code')->order_by('l.location_name')->limit($limit,$offset)->get()->result_array();
        return $this->page($items,$total,$page,$limit);
    }
    public function location(string $id): ?array { return $this->db->select('l.*, an.asset_number, s.specific_name, a.area_name')->from('locations l')->join('asset_numbers an','an.asset_id=l.asset_id','left')->join('specifics s','s.specific_id=l.specific_id','left')->join('areas a','a.area_id=s.area_id','left')->where('l.location_id',$id)->get()->row_array() ?: null; }

    public function create_location(string $name,?string $assetId,?string $specificId): string
    {
        $name=trim($name);if($name===''||strlen($name)>150)throw new InvalidArgumentException('Location name is required.');
        $route=$this->resolve_location_specific($assetId,$specificId); if(!$route)throw new InvalidArgumentException('Assign the location to a specific or select an asset number with a specific.');
        $this->db->trans_begin();
        try{
            $count=(int)$this->db->count_all('locations');
            $this->db->query("INSERT INTO system_sequence_states (sequence_key,next_value) VALUES ('location_code', ?) ON CONFLICT (sequence_key) DO NOTHING",array($count));
            $row=$this->db->query("UPDATE system_sequence_states SET next_value=next_value+1 WHERE sequence_key='location_code' RETURNING next_value")->row_array();
            $code=dts_numeric_to_location_code((int)$row['next_value']);
            $this->db->insert('locations',array('location_name'=>$name,'location_code'=>$code,'is_active'=>true,'asset_id'=>$assetId?:null,'specific_id'=>$route,'created_at'=>date('Y-m-d H:i:s'),'updated_at'=>date('Y-m-d H:i:s')));
            $id=(string)$this->db->insert_id();$this->db->trans_commit();return $id;
        }catch(Throwable $e){$this->db->trans_rollback();throw $e;}
    }

    public function update_location(string $id,string $name,?string $assetId,?string $specificId): void
    {
        $current=$this->location($id);if(!$current)throw new RuntimeException('Location not found.');
        $route=$this->resolve_location_specific($assetId,$specificId?:($current['specific_id']??null));if(!$route)throw new InvalidArgumentException('Assign the location to a specific or select an asset number with a specific.');
        $specific=$this->db->select('area_id')->where('specific_id',$route)->get('specifics')->row_array();if(!$specific||empty($specific['area_id']))throw new RuntimeException('The selected specific has no area.');
        $this->db->trans_start();
        $this->db->where('location_id',$id)->update('locations',array('location_name'=>trim($name),'asset_id'=>$assetId?:null,'specific_id'=>$route,'updated_at'=>date('Y-m-d H:i:s')));
        $this->db->where('location_id',$id)->update('hardcopy_documents',array('asset_id'=>$assetId?:null,'specific_id'=>$route,'area_id'=>$specific['area_id']));
        $this->db->trans_complete();if(!$this->db->trans_status())throw new RuntimeException('Unable to update location.');
    }

    public function archive_location(string $id): void
    {
        $this->db->where('location_id',$id)->update('locations',array('is_active' => false,'archived_at'=>date('Y-m-d H:i:s'),'updated_at'=>date('Y-m-d H:i:s')));
    }

    public function area_options(): array { return $this->db->order_by('area_name')->get('areas')->result_array(); }
    public function specific_options(): array { return $this->db->select('s.*,a.area_name')->from('specifics s')->join('areas a','a.area_id=s.area_id','left')->order_by('s.specific_name')->get()->result_array(); }
    public function asset_options(): array { return $this->db->select('an.*,s.specific_name')->from('asset_numbers an')->join('specifics s','s.specific_id=an.specific_id','left')->order_by('an.asset_number')->get()->result_array(); }

    private function resolve_location_specific(?string $assetId,?string $specificId): ?string
    {
        if($assetId){$asset=$this->db->select('specific_id')->where('asset_id',$assetId)->get('asset_numbers')->row_array();if($asset&&!empty($asset['specific_id']))return (string)$asset['specific_id'];}
        return $specificId ? dts_id_string($specificId) : null;
    }
    private function paged(string $table,string $order,int $page,int $limit,string $direction): array
    {
        $offset=($page-1)*$limit;$total=(int)$this->db->count_all($table);$items=$this->db->order_by($order,$direction)->limit($limit,$offset)->get($table)->result_array();return $this->page($items,$total,$page,$limit);
    }
    private function page(array $items,int $total,int $page,int $limit): array
    {
        $pages=(int)ceil($total/max(1,$limit));return array('items'=>$items,'meta'=>array('total'=>$total,'page'=>$page,'limit'=>$limit,'total_pages'=>$pages,'has_next_page'=>$page<$pages,'has_previous_page'=>$page>1));
    }
}
