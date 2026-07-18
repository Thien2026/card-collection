"use client";
import { useEffect } from "react";
export type RecentRecord={type:"collection"|"series"|"card";id:string;title:string;href:string;image?:string|null;timestamp:number};
export const recentKey=(userId?:string)=>`cardvault:recent:${userId||"guest"}`;
export function RecentViewTracker({record,userId}:{record:Omit<RecentRecord,"timestamp">;userId?:string}){useEffect(()=>{try{const key=recentKey(userId);const old=JSON.parse(localStorage.getItem(key)||"[]") as RecentRecord[];localStorage.setItem(key,JSON.stringify([{...record,timestamp:Date.now()},...old.filter(x=>!(x.type===record.type&&x.id===record.id))].slice(0,50)))}catch{}},[record,userId]);return null}
