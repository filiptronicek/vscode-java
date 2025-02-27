'use strict';

import * as fse from "fs-extra";
import * as path from "path";
import { CancellationToken, CodeAction, CodeActionContext, CodeActionKind, CodeActionProvider, CodeActionProviderMetadata, Command, commands, Diagnostic, DiagnosticRelatedInformation, ExtensionContext, ProviderResult, Range, Selection, TextDocument, Uri } from "vscode";
import { Commands } from "../commands";
import { upgradeGradle } from "../standardLanguageClientUtils";

export class GradleCodeActionProvider implements CodeActionProvider<CodeAction> {

	private static UPGRADE_GRADLE_WRAPPER_TITLE = "Upgrade Gradle Wrapper";
	private static WRAPPER_PROPERTIES_DESCRIPTOR = "gradle/wrapper/gradle-wrapper.properties";
	private static GRADLE_PROBLEM_ID = 0x00080000;
	private static GRADLE_INVALID_TYPE_CODE_ID = GradleCodeActionProvider.GRADLE_PROBLEM_ID + 1;

	constructor(context: ExtensionContext) {
		context.subscriptions.push(commands.registerCommand(Commands.UPGRADE_GRADLE_WRAPPER, (projectUri: string) => {
			upgradeGradle(projectUri);
		}));
	}

	public provideCodeActions(document: TextDocument, range: Range | Selection, context: CodeActionContext, token: CancellationToken): ProviderResult<(CodeAction | Command)[]> {
		if (context?.diagnostics?.length && context.diagnostics[0].source === "Java") {
			return this.provideGradleCodeActions(document, context.diagnostics);
		}
		return [];
	}

	async provideGradleCodeActions(document: TextDocument, diagnostics: readonly Diagnostic[]): Promise<CodeAction[]> {
		const codeActions = [];
		for (const diagnostic of diagnostics) {
			if (diagnostic.message?.startsWith("The build file has been changed")) {
				const reloadProjectAction = new CodeAction("Reload project", CodeActionKind.QuickFix);
				reloadProjectAction.command = {
					title: "Reload Project",
					command: Commands.CONFIGURATION_UPDATE,
					arguments: [document.uri],
				};
				codeActions.push(reloadProjectAction);
				continue;
			}

			const documentUri = document.uri.toString();
			if (documentUri.endsWith(GradleCodeActionProvider.WRAPPER_PROPERTIES_DESCRIPTOR) && diagnostic.code === GradleCodeActionProvider.GRADLE_INVALID_TYPE_CODE_ID.toString()) {
				const projectPath = path.resolve(Uri.parse(documentUri).fsPath, "..", "..", "..").normalize();
				if (await fse.pathExists(projectPath)) {
					const projectUri = Uri.file(projectPath).toString();
					const upgradeWrapperCommand: Command = {
						title: GradleCodeActionProvider.UPGRADE_GRADLE_WRAPPER_TITLE,
						command: Commands.UPGRADE_GRADLE_WRAPPER,
						arguments: [projectUri]
					};
					const codeAction = new CodeAction(GradleCodeActionProvider.UPGRADE_GRADLE_WRAPPER_TITLE, CodeActionKind.QuickFix.append("gradle"));
					codeAction.command = upgradeWrapperCommand;
					codeActions.push(codeAction);
				}
			}
		}
		return codeActions;
	}
}

export const gradleCodeActionMetadata: CodeActionProviderMetadata = {
	providedCodeActionKinds: [
		CodeActionKind.QuickFix.append("gradle")
	]
};
