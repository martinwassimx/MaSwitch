const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('src/pages/AccountsPage.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// Remove lines 66-68 and 78-83
content = content.replace(/  const enrolledRiotProfileIds = useAppStore\(\(s\) => s\.enrolledRiotProfileIds\);\r?\n/, '');
content = content.replace(/  const isEnrollingRiot = useAppStore\(\(s\) => s\.isEnrollingRiot\);\r?\n/, '');
content = content.replace(/  const isLiveSwitchingRiot = useAppStore\(\(s\) => s\.isLiveSwitchingRiot\);\r?\n/, '');
content = content.replace(/  const riotLiveSwitchError = useAppStore\(\(s\) => s\.riotLiveSwitchError\);\r?\n/, '');
content = content.replace(/  const enrollRiotProfile = useAppStore\(\(s\) => s\.enrollRiotProfile\);\r?\n/, '');
content = content.replace(/  const removeEnrolledRiotProfile = useAppStore\(\(s\) => s\.removeEnrolledRiotProfile\);\r?\n/, '');
content = content.replace(/  const liveSwitchRiotProfile = useAppStore\(\(s\) => s\.liveSwitchRiotProfile\);\r?\n/, '');
content = content.replace(/  const recoverRiotLiveSwitch = useAppStore\(\(s\) => s\.recoverRiotLiveSwitch\);\r?\n/, '');
content = content.replace(/  const clearRiotLiveSwitchError = useAppStore\(\(s\) => s\.clearRiotLiveSwitchError\);\r?\n/, '');

// Remove lines 85-89
content = content.replace(/  const \[consentModalProfile, setConsentModalProfile\] = useState<AccountProfile \| null>\(null\);\r?\n/, '');
content = content.replace(/  const \[enrollSuccessMessage, setEnrollSuccessMessage\] = useState<string \| null>\(null\);\r?\n/, '');
content = content.replace(/  const \[activeLiveSwitchId, setActiveLiveSwitchId\] = useState<string \| null>\(null\);\r?\n/, '');
content = content.replace(/  const \[isRecovering, setIsRecovering\] = useState\(false\);\r?\n/, '');
content = content.replace(/  const \[recoveryNotice, setRecoveryNotice\] = useState<string \| null>\(null\);\r?\n/, '');

// Remove functions handleToggleRiotLiveSwitching, handleEnrollConfirmed, handleLiveSwitch, handleRecoverSession
const funcStart = '  const handleToggleRiotLiveSwitching = async () => {';
const funcEnd = '  const openCreateModal = (platformId?: PlatformId) => {';

const fStartIndex = content.indexOf(funcStart);
const fEndIndex = content.indexOf(funcEnd);

if (fStartIndex !== -1 && fEndIndex !== -1) {
  content = content.slice(0, fStartIndex) + content.slice(fEndIndex);
  console.log('Unused functions removed successfully.');
} else {
  console.error('Could not find unused functions boundaries');
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log('AccountsPage.tsx cleaned up.');

