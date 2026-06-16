// Real Milwaukee E-Notify emails pulled live from mke-alerts@agentmail.to
// (public-record government broadcasts — no private content). HTML-stripped
// bodies; these are the ground truth the extractor is written against.

export const MEETING = {
  messageId: '<1096488662.49857.1781098874154@WEBAPP01.ad.milwaukee.gov>',
  subject: 'Zoning, Neighborhoods and Development Committee Meeting 6/16/26 at 9 AM',
  receivedAt: '2026-06-10T13:41:14.000Z',
  bodyText:
    'You have a Milwaukee.Gov E-Notification for Common Council There is a meeting of the ' +
    'Zoning, Neighborhoods and Development Committee scheduled for Tuesday, June 16, 2026 at 9 a.m. ' +
    'in Room 301-B, City Hall, Milwaukee, WI 53202. For further details of this meeting, visit ' +
    'https://milwaukee.legistar.com/MeetingDetail.aspx?ID=1348260&GUID=56216FAD-06F2-428A-AF3E-2FE0BE39942F&Options=info|&Search= ' +
    'Accommodation Requests Reasonable accommodations ... Contact the City of Milwaukee ADA Coordinator.',
  attachments: [
    {
      filename: 'ZND_Agenda_06.16.26.pdf',
      contentType: 'application/pdf',
      attachmentId: '52334088-ba0a-4bec-b7da-c191e9ae4d6d',
      size: 116678,
    },
  ],
};

export const PERMIT = {
  messageId: '<1808599183.54396.1781080248061@WEBAPP02.ad.milwaukee.gov>',
  subject: 'Neighborhood Services new record #COM-ALT-26-00358',
  receivedAt: '2026-06-10T08:30:00.000Z',
  bodyText:
    'You have a Milwaukee.Gov E-Notification for Neighborhood Services Activity in BID(s) [2]. ' +
    'At 200 N JEFFERSON ST (taxkey 3921150100), there is a new record #COM-ALT-26-00358 in the ' +
    'City of Milwaukee Land Management System. Description: Commercial Alteration Permit. ' +
    'Please click link below for record detail. ' +
    'http://aca3.accela.com/milwaukee/urlrouting.ashx?type=1000&Module=Building&capID1=26CAP&capID2=00000&capID3=04UGT&agencyCode=MILWAUKEE ' +
    'Please do not respond to this email.',
  attachments: [],
};

export const LICENSE = {
  messageId: '<297204149.49791.1781094938878@WEBAPP01.ad.milwaukee.gov>',
  subject: 'RENEWAL Class B Tavern License',
  receivedAt: '2026-06-10T12:35:38.000Z',
  bodyText:
    'You have a Milwaukee.Gov E-Notification for Licenses Applied for in Aldermanic District #3. ' +
    'At 2060 N HUMBOLDT AV a RENEWAL Class B Tavern License license was applied for on Tuesday, ' +
    'June 9, 2026 for Cozumel Mexican Restaurant, COZUMEL III, LLC. Please do not respond to this email.',
  attachments: [],
};

export const ENFORCEMENT = {
  messageId: '<1808599183.54401.1781080248999@WEBAPP02.ad.milwaukee.gov>',
  subject: 'Neighborhood Services new record #ENF-2026-17411',
  receivedAt: '2026-06-10T08:35:00.000Z',
  bodyText:
    'You have a Milwaukee.Gov E-Notification for Neighborhood Services Activity in BID(s) [40]. ' +
    'At 6160 S 6TH ST (taxkey # 6879958110), there is a new record #ENF-2026-17411 in the ' +
    'City of Milwaukee Land Management System. Description: DNS Activity:Trailer was torn down without a permit.. ' +
    'Please click link below for record detail. ' +
    'http://aca3.accela.com/milwaukee/urlrouting.ashx?type=1000&Module=Enforcement&capID1=26CAP&capID2=00000&capID3=04TFS&agencyCode=MILWAUKEE',
  attachments: [],
};

// A board agenda whose label is NOT "Common Council" — still a meeting.
export const REDEV_AGENDA = {
  messageId: '<redev.1781080248061@WEBAPP02.ad.milwaukee.gov>',
  subject: 'Redevelopment Authority Agenda-6/18/2026 Regular Meeting',
  receivedAt: '2026-06-10T14:00:00.000Z',
  bodyText:
    'You have a Milwaukee.Gov E-Notification for Redevelopment Authority Agenda The meetings will be ' +
    'hybrid with an in-person and virtual option available. As such, those wishing to provide testimony ' +
    'relating to this matter are encouraged to do so via the following methods: 1. Submit comments via email.',
  attachments: [],
};

// A school-board newsletter. Note: "District 1" here is a SCHOOL district, not
// an aldermanic district — the aldermanic extractor must NOT pick it up.
export const NEWSLETTER = {
  messageId: '<mps.herndon.june2026@WEBAPP01.ad.milwaukee.gov>',
  subject: 'MPS Board Director Herndon-June 2026 Newsletter',
  receivedAt: '2026-06-10T15:00:00.000Z',
  bodyText:
    'You have a Milwaukee.Gov E-Notification for 1st School District District 1 Newsletter District 1 ' +
    'Newsletter Dear neighbors, here is my June update on Milwaukee Public Schools.',
  attachments: [],
};

export const ALL = [MEETING, PERMIT, LICENSE, ENFORCEMENT, REDEV_AGENDA, NEWSLETTER];
