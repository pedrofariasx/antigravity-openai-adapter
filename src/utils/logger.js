/**
 * Simple logger utility with colored output
 */

const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

// Check if debug mode is enabled
const isDebugEnabled = process.env.DEBUG ==='true' || process.argv.includes('--debug');

function formatTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

export const logger = {
    isDebugEnabled,

    info(message, ...args) {
        console.log(`${COLORS.gray}[${formatTimestamp()}]${COLORS.reset} ${COLORS.blue}INFO${COLORS.reset}${message}`, ...args);
    },

    success(message, ...args) {
        console.log(`${COLORS.gray}[${formatTimestamp()}]${COLORS.reset} ${COLORS.green}OK${COLORS.reset}    ${message}`, ...args);
    },

    warn(message, ...args) {
        console.log(`${COLORS.gray}[${formatTimestamp()}]${COLORS.reset} ${COLORS.yellow}WARN${COLORS.reset}  ${message}`, ...args);
    },

    error(message, ...args) {
        console.log(`${COLORS.gray}[${formatTimestamp()}]${COLORS.reset} ${COLORS.red}ERROR${COLORS.reset} ${message}`, ...args);
    },

    debug(message, ...args) {
        if (isDebugEnabled) {
            console.log(`${COLORS.gray}[${formatTimestamp()}]${COLORS.reset} ${COLORS.magenta}DEBUG${COLORS.reset} ${message}`, ...args);
        }
    }
};

export default logger;