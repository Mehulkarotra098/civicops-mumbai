// Templates for text that mixes words with data (ward codes, counts, times). Each English pattern maps
// to a Marathi and a Hindi template; $1.. are the captured data, kept as they are.
export const PATTERNS: { re: RegExp; mr: string; hi: string }[] = [
  { re: /^Ward ([A-Z](?:\/[A-Z])?)$/, mr: 'वॉर्ड $1', hi: 'वार्ड $1' },
  { re: /^(\d[\d,]*) min ago$/, mr: '$1 मिनिटांपूर्वी', hi: '$1 मिनट पहले' },
  { re: /^(\d[\d,]*) h ago$/, mr: '$1 तासांपूर्वी', hi: '$1 घंटे पहले' },
  { re: /^(\d[\d,]*) days? ago$/, mr: '$1 दिवसांपूर्वी', hi: '$1 दिन पहले' },
  { re: /^just now$/i, mr: 'आत्ताच', hi: 'अभी' },
  { re: /^(\d[\d,]*)% complete$/, mr: '$1% पूर्ण', hi: '$1% पूर्ण' },
  { re: /^Due (.+)$/, mr: 'मुदत $1', hi: 'नियत तिथि $1' },
  { re: /^submitted (.+)$/i, mr: 'नोंदवले $1', hi: 'दर्ज किया $1' },
  { re: /^(\d+)d (\d+)h left$/, mr: '$1 दिवस $2 तास बाकी', hi: '$1 दिन $2 घंटे बाकी' },
  { re: /^(\d+)h (\d+)m left$/, mr: '$1 तास $2 मिनिटे बाकी', hi: '$1 घंटे $2 मिनट बाकी' },
  { re: /^Live · updated (.+) IST$/, mr: 'थेट · अद्यतन $1 IST', hi: 'लाइव · अपडेट $1 IST' },
  { re: /^All \((\d+)\)$/, mr: 'सर्व ($1)', hi: 'सभी ($1)' },
  { re: /^Overdue \((\d+)\)$/, mr: 'मुदत उलटली ($1)', hi: 'समय-सीमा पार ($1)' },
  { re: /^Due soon \((\d+)\)$/, mr: 'लवकरच मुदत ($1)', hi: 'जल्द नियत ($1)' },
  { re: /^Unassigned \((\d+)\)$/, mr: 'नियुक्त नाही ($1)', hi: 'असाइन नहीं ($1)' },
];
