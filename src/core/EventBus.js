/**
 * Simple event bus for decoupled communication between components
 */
export class EventBus {
    constructor() {
        this.events = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @param {Object} context - Context for the callback (optional)
     */
    on(event, callback, context = null) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }

        this.events.get(event).push({
            callback,
            context
        });
    }

    /**
     * Subscribe to an event only once
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @param {Object} context - Context for the callback (optional)
     */
    once(event, callback, context = null) {
        const onceCallback = (...args) => {
            callback.apply(context, args);
            this.off(event, onceCallback);
        };

        this.on(event, onceCallback, context);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function to remove (optional)
     */
    off(event, callback = null) {
        if (!this.events.has(event)) {
            return;
        }

        if (callback === null) {
            // Remove all listeners for this event
            this.events.delete(event);
        } else {
            // Remove specific callback
            const listeners = this.events.get(event);
            const filteredListeners = listeners.filter(listener => listener.callback !== callback);
            
            if (filteredListeners.length === 0) {
                this.events.delete(event);
            } else {
                this.events.set(event, filteredListeners);
            }
        }
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to callbacks
     */
    emit(event, ...args) {
        if (!this.events.has(event)) {
            return;
        }

        const listeners = this.events.get(event);
        
        // Create a copy of listeners to avoid issues if listeners are modified during emission
        const listenersToCall = [...listeners];

        listenersToCall.forEach(listener => {
            try {
                listener.callback.apply(listener.context, args);
            } catch (error) {
                console.error(`Error in event listener for '${event}':`, error);
            }
        });
    }

    /**
     * Get the number of listeners for an event
     * @param {string} event - Event name
     * @returns {number} Number of listeners
     */
    listenerCount(event) {
        return this.events.has(event) ? this.events.get(event).length : 0;
    }

    /**
     * Get all event names that have listeners
     * @returns {string[]} Array of event names
     */
    eventNames() {
        return Array.from(this.events.keys());
    }

    /**
     * Remove all listeners for all events
     */
    removeAllListeners() {
        this.events.clear();
    }

    /**
     * Check if there are any listeners for an event
     * @param {string} event - Event name
     * @returns {boolean} True if there are listeners
     */
    hasListeners(event) {
        return this.events.has(event) && this.events.get(event).length > 0;
    }

    /**
     * Get debug information about the event bus
     * @returns {Object} Debug information
     */
    getDebugInfo() {
        const info = {};
        
        for (const [event, listeners] of this.events.entries()) {
            info[event] = {
                listenerCount: listeners.length,
                listeners: listeners.map(listener => ({
                    hasContext: listener.context !== null,
                    functionName: listener.callback.name || 'anonymous'
                }))
            };
        }

        return info;
    }
}