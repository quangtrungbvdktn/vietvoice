"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProjectEditor } from "../../../../components/editor/project-editor";
import { apiFetch } from "../../../../lib/api";
export default function Editor(){
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const [version, setVersion] = useState(0); const [message, setMessage] = useState("");
  return <main className="sources-shell"><p className="eyebrow">Trình biên tập</p><h1>Kiểm tra bản dịch & giọng đọc</h1>{message ? <p>{message}</p> : null}<ProjectEditor segments={[{id:"segment-1",startMs:2_000,endMs:4_600,original:"我们开始吧。",translation:"Chúng ta bắt đầu thôi.",role:"Nữ chính",voice:"Hoài My"}]} onSave={async(segment)=>{const response=await apiFetch(`/v1/projects/${id}/editor`,{method:"PATCH",body:JSON.stringify({expectedVersion:version,translation:segment.translation,voice:segment.voice})});if(response.ok){const result=await response.json() as {version:number};setVersion(result.version);setMessage("Đã lưu thay đổi.");}else setMessage("Không thể lưu; dữ liệu có thể đã được sửa ở nơi khác.");}} onExport={async(profile)=>{const response=await apiFetch(`/v1/projects/${id}/exports`,{method:"POST",body:JSON.stringify({profile})});if(response.ok){const result=await response.json() as {id:string};router.push(`/projects/${id}/publish?exportId=${result.id}`);}else setMessage("Không thể tạo bản xuất.");}}/></main>
}
