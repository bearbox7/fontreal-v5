import { NextResponse } from 'next/server';
export function GET(){return NextResponse.json({ok:true,app:'FontReal V5',gb2312:7445,glyphEditor:true,formats:['ttf','otf']});}
