import {redirect} from 'next/navigation';
import {requireChatGPTUser} from '../chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Gestione(){await requireChatGPTUser('/gestione');redirect('/workspace.html?gestione=1')}
