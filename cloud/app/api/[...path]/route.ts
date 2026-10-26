import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {handle} from '../../../lib/api.mjs';
export async function GET(request:Request){return handle(request,env,await getChatGPTUser())}
export async function POST(request:Request){return handle(request,env,await getChatGPTUser())}
