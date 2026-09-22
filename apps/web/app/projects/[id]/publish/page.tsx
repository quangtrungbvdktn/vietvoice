"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PublishForm } from "../../../../components/publish-form";
import { apiFetch } from "../../../../lib/api";
export default function Publish(){const exportId=useSearchParams().get("exportId");const [message,setMessage]=useState("");return <main className="sources-shell"><p className="eyebrow">Xuất bản</p><h1>Đăng video an toàn</h1>{message?<p>{message}</p>:null}<PublishForm onPublish={async(value)=>{if(!exportId)return setMessage("Thiếu bản xuất cần đăng.");const response=await apiFetch("/v1/social/publish",{method:"POST",body:JSON.stringify({exportId,...value})});if(!response.ok)return setMessage("Không thể đăng tự động. Hãy kiểm tra quyền nền tảng.");const result=await response.json() as {status:string};setMessage(result.status==="manual_ready"?"Đã tạo gói đăng thủ công.":"Đã đưa vào hàng đợi xuất bản.");}}/></main>}
