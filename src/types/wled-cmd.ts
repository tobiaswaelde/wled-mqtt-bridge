export enum Command {
	SetState = 'set_state',
	GetState = 'get_state',
	GetInfo = 'get_info',
	GetEffects = 'get_effects',
	GetPalettes = 'get_palettes',
}

export type WledCommand =
	| { cmd: Command.SetState; state: any }
	| { cmd: Command.GetState }
	| { cmd: Command.GetInfo }
	| { cmd: Command.GetEffects }
	| { cmd: Command.GetPalettes };
