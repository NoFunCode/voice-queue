import { voice } from '@livekit/agents';

export class Agent extends voice.Agent {
  constructor() {
    super({
      instructions: 'You are a helpful voice AI assistant.',
    });
  }
}