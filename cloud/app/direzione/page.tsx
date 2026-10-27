import {redirect} from 'next/navigation';
import {requireChatGPTUser} from '../chatgpt-auth';
export const dynamic='force-dynamic';
// Native Sites identity is required; API validates SALCHECK_OWNER_EMAIL and stable owner ID.
export default async function Direzione(){
 await requireChatGPTUser('/direzione');
 redirect('/workspace.html?direzione=1');
}
