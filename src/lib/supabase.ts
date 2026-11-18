import "server-only";
import {createServerClient} from "@supabase/ssr";
import {createClient} from "@supabase/supabase-js";
import {cookies} from "next/headers";
export const configured=()=>Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY&&process.env.SUPABASE_SERVICE_ROLE_KEY);
export function db(){if(!configured())throw Error("يلزم إعداد Supabase لتفعيل النظام");return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});}
export async function auth(){const jar=await cookies();return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>jar.getAll(),setAll:values=>{try{values.forEach(({name,value,options})=>jar.set(name,value,options));}catch{/* Server components cannot mutate cookies. */}}});}
export async function admin(superOnly=false){if(!configured())throw Error("يلزم إعداد Supabase");const client=await auth();const {data:{user},error}=await client.auth.getUser();if(error||!user)throw Error("UNAUTHORIZED");const {data:profile}=await db().from("profiles").select("role,display_name").eq("id",user.id).eq("enabled",true).single();if(!profile||(superOnly&&profile.role!=="super_admin"))throw Error("FORBIDDEN");return {id:user.id,...profile};}
