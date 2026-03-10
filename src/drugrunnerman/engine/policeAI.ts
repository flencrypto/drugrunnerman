export enum CopState {
	Patrol,
	Pursuit,
	Shootout,
	Arrest,
}

export class PoliceAI {
	state: CopState = CopState.Patrol;

	step(threat: number, rng: () => number) {
		switch (this.state) {
			case CopState.Patrol:
				if (rng() < threat) this.state = CopState.Pursuit;
				break;
			case CopState.Pursuit:
				if (rng() < 0.5) this.state = CopState.Shootout;
				else this.state = CopState.Arrest;
				break;
			case CopState.Shootout:
			case CopState.Arrest:
				this.state = CopState.Patrol;
				break;
		}
		return this.state;
	}
}
