import part1 from './lockup.part1';
import part2 from './lockup.part2';
import part3 from './lockup.part3';
import part4 from './lockup.part4';

/**
 * Exact approved Verigence lockup pixels, bundled with the application.
 * Keeping the browser source self-contained avoids CDN/MIME/path differences between Chrome and Firefox.
 */
export const verigenceLockup = `data:image/png;base64,${part1}${part2}${part3}${part4}`;

export default verigenceLockup;
