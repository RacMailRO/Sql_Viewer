import { ERDApplication } from './src/core/ERDApplication.js';

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const app = new ERDApplication();
    await app.initialize();
});