export type Report = {event_id:string;contact_id:string;kind:string;occurred_at:string;payload:Record<string,unknown>};
export function normalizeEvent(raw:Record<string,unknown>):Report {
 const event_id=String(raw.event_id??raw.id??'');
 const recipient=raw.recipient as Record<string,unknown>|string|undefined;
 const contact_id=String(raw.external_contact_id??raw.contact_id??raw.recipient_id??(typeof recipient==='object'?recipient.external_id??recipient.id:recipient)??'');
 const value=String(raw.event_type??raw.type??raw.event??'').toLowerCase();
 const kind=({deliver:'delivered',delivery:'delivered',bounce:'bounced',open:'opened',unsubscribe:'unsubscribed',click:'clicked'} as Record<string,string>)[value]??value;
 const occurred_at=String(raw.occurred_at_utc??raw.occurred_at??raw.timestamp??'');
 if(!event_id||!contact_id||!['delivered','bounced','opened','unsubscribed','clicked','complaint'].includes(kind)||!Number.isFinite(Date.parse(occurred_at))) throw new Error('Unrecognized provider event; cursor not advanced');
 return {event_id,contact_id,kind,occurred_at,payload:raw};
}
