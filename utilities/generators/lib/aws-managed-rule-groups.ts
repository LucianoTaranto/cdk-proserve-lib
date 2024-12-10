/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { readFileSync, writeFileSync } from 'fs';
import {
    ListAvailableManagedRuleGroupsCommand,
    WAFV2Client
} from '@aws-sdk/client-wafv2';

function formatRuleGroupName(name: string): string {
    let formattedName = name.replace(/^AWSManagedRules/, '');

    formattedName = formattedName
        .replace(/SQLi/g, 'SQL_DATABASE')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toUpperCase();

    return formattedName;
}

export async function generateAndInjectAwsManagedRuleEnum() {
    try {
        const client = new WAFV2Client({ region: 'us-east-1' });
        const command = new ListAvailableManagedRuleGroupsCommand({
            Scope: 'REGIONAL'
        });

        const response = await client.send(command);
        const ruleGroups = response.ManagedRuleGroups ?? [];

        if (ruleGroups.length === 0) {
            throw new Error('No managed rule groups found');
        }

        // Create a Map to store rule names and their descriptions
        const ruleGroupMap = new Map(
            ruleGroups
                .filter((rule) => rule.Name && rule.Description)
                .map((rule) => [rule.Name, rule.Description])
        );

        // Generate Enum entries with descriptions
        const enumEntries = Array.from(ruleGroupMap.entries()).map(
            ([ruleName, description]) => {
                const name = formatRuleGroupName(ruleName!);
                return `        /** ${description} */\n        ${name} = '${ruleName}'`;
            }
        );

        // Create the Enum string
        const enumString = `    export enum AwsManagedRuleGroup {
${enumEntries.join(',\n\n')}
    }`;

        // Read the existing file content
        const filePath = 'src/constructs/web-application-firewall/index.ts';
        let fileContent = readFileSync(filePath, 'utf8');

        // Find the location to inject the enum
        const startMarker = '/** WAF Managed Rule Groups */';
        const endMarker = '/** End WAF Managed Rule Groups */';
        const startIndex = fileContent.indexOf(startMarker);
        const endIndex = fileContent.indexOf(endMarker);

        if (startIndex === -1 || endIndex === -1) {
            throw new Error('Could not find injection markers in the file');
        }

        // Replace the existing content between markers with the new enum
        const newContent =
            fileContent.slice(0, startIndex + startMarker.length) +
            '\n' +
            enumString +
            '\n    ' +
            fileContent.slice(endIndex);

        // Write the modified content back to the file
        writeFileSync(filePath, newContent);

        console.log(
            `AWS Managed Rules generated -- count: ${ruleGroupMap.size}`
        );
    } catch (error) {
        console.error('Error generating and injecting enum:', error);
    }
}
