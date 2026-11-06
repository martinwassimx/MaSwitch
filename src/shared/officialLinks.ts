export const MASWITCH_WEBSITE_URL = 'https://maswitch.martinx.work/';
export const MASWITCH_FAQ_URL = 'https://maswitch.martinx.work/faq';
export const MASWITCH_PRIVACY_URL = 'https://maswitch.martinx.work/privacy';
export const MASWITCH_REPOSITORY_URL = 'https://github.com/martinwassimx/MaSwitch';
export const MASWITCH_ISSUES_URL = 'https://github.com/martinwassimx/MaSwitch/issues';

export interface OfficialLink {
  id: 'website' | 'faq' | 'privacy' | 'github' | 'issues';
  label: string;
  url: string;
}

export const ABOUT_LINKS: readonly OfficialLink[] = [
  { id: 'website', label: 'maswitch.martinx.work', url: MASWITCH_WEBSITE_URL },
  { id: 'faq', label: 'Help & FAQ', url: MASWITCH_FAQ_URL },
  { id: 'privacy', label: 'Privacy & Security', url: MASWITCH_PRIVACY_URL },
  { id: 'github', label: 'GitHub', url: MASWITCH_REPOSITORY_URL },
  { id: 'issues', label: 'Report an Issue', url: MASWITCH_ISSUES_URL },
];
