// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';

interface DocItem {
    readonly name: string;
    description: string;
}

interface DocItems {
    readonly constructs: DocItem[];
    readonly aspects: DocItem[];
    readonly patterns: DocItem[];
}

function parseApiDoc(filePath: string): DocItems {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const constructs: DocItem[] = [];
    const aspects: DocItem[] = [];
    const patterns: DocItem[] = [];

    let inIgnoredSection = false;
    let currentItem: DocItem | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Handle section headers to determine if we should ignore this section
        if (line.startsWith('## ')) {
            // Check if this is a section we want to ignore
            if (line.startsWith('## Structs') || line.startsWith('## Enum')) {
                inIgnoredSection = true;
                continue;
            } else {
                inIgnoredSection = false;
            }
        }

        // Skip processing if we're in an ignored section
        if (inIgnoredSection) {
            continue;
        }

        // Only look for class/construct headers with id attributes
        if (line.startsWith('### ') && line.includes('id="')) {
            // Process previous item if it exists
            if (currentItem) {
                // Use ID to categorize the previous item if we haven't done so already
                const idMatch = line.match(/id="([^"]+)"/);
                if (idMatch && idMatch[1]) {
                    const id = idMatch[1].toLowerCase();
                    if (id.includes('.patterns.')) {
                        patterns.push(currentItem);
                    } else if (id.includes('.aspects.')) {
                        aspects.push(currentItem);
                    } else if (
                        id.includes('.constructs.') ||
                        !id.includes('.types.')
                    ) {
                        constructs.push(currentItem);
                    }
                }
            }

            // Extract ID to determine if we should process this item
            const idMatch = line.match(/id="([^"]+)"/);

            if (idMatch && idMatch[1]) {
                const id = idMatch[1].toLowerCase();

                // Skip types entries
                if (id.includes('.types.')) {
                    currentItem = null;
                    continue;
                }

                // Extract name and create new item
                const name = line.replace(/### /, '').split(' ')[0];
                currentItem = {
                    name,
                    description: ''
                };

                // Get description from following lines
                let j = i + 1;
                let description: string[] = [];
                let foundDescription = false;

                while (j < lines.length) {
                    const nextLine = lines[j].trim();

                    if (
                        nextLine.startsWith('#') ||
                        nextLine.startsWith('---')
                    ) {
                        break;
                    }

                    if (foundDescription && nextLine === '') {
                        break;
                    }

                    // Skip "Implements" lines
                    if (nextLine.startsWith('- *Implements:*')) {
                        j++;
                        continue;
                    }

                    if (nextLine) {
                        description.push(nextLine);
                        foundDescription = true;
                    }

                    j++;
                }

                if (description.length > 0) {
                    currentItem.description = description.join(' ');
                }

                // Add to appropriate category based on ID
                if (id.includes('.patterns.')) {
                    patterns.push(currentItem);
                    currentItem = null;
                } else if (id.includes('.aspects.')) {
                    aspects.push(currentItem);
                    currentItem = null;
                } else if (id.includes('.constructs.')) {
                    constructs.push(currentItem);
                    currentItem = null;
                }
                // If it doesn't match any specific category, leave currentItem for potential later processing
            }
        }
    }

    // Add the last item if it exists and wasn't categorized
    if (currentItem) {
        constructs.push(currentItem); // Default to constructs if can't determine
    }

    return { constructs, aspects, patterns };
}

function generateMarkdown(
    constructs: DocItem[],
    aspects: DocItem[],
    patterns: DocItem[]
): string {
    let output = '';
    output += `Total: ${constructs.length + aspects.length + patterns.length}\n\n`;
    output += '### 🧱 Constructs\n\n';
    output +=
        'Constructs are the basic building blocks of AWS Cloud Development Kit (AWS CDK) applications. A construct is a component within your application that represents one or more AWS CloudFormation resources and their configuration. You build your application, piece by piece, by importing and configuring constructs. To learn more about constructs, check out the [AWS CDK documentation](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html).\n\n';
    output += `Count: ${constructs.length}\n\n`;
    for (const construct of constructs) {
        const anchor = construct.name.toLowerCase().replace(/\s+/g, '-');
        output += `- [**${construct.name}**](API.md#${anchor}-): ${construct.description}\n`;
    }

    output += '\n### 🎭 Aspects\n\n';
    output +=
        'Aspects are a way to apply an operation to all constructs in a given scope. The aspect could modify the constructs, such as by adding tags. Or it could verify something about the state of the constructs, such as making sure that all buckets are encrypted. To learn more about aspects, check out the [AWS CDK documentation](https://docs.aws.amazon.com/cdk/v2/guide/aspects.html).\n\n';
    output += `Count: ${aspects.length}\n\n`;
    for (const aspect of aspects) {
        const anchor = aspect.name.toLowerCase().replace(/\s+/g, '-');
        output += `- [**${aspect.name}**](API.md#${anchor}-): ${aspect.description}\n`;
    }

    // Add Patterns section
    output += '\n### 🎯 Patterns\n\n';
    output +=
        'Patterns are higher-level abstractions that combine multiple constructs and their configurations to form an opinionated solution. They help developers implement best practices and reduce the amount of code needed to build well-architected infrastructure. Patterns typically orchestrate multiple AWS services together in a way that follows AWS best practices. To learn more about patterns, check out the [AWS CDK documentation](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html#constructs_lib_levels).\n\n';
    output += `Count: ${patterns.length}\n\n`;
    for (const pattern of patterns) {
        const anchor = pattern.name.toLowerCase().replace(/\s+/g, '-');
        output += `- [**${pattern.name}**](API.md#${anchor}-): ${pattern.description}\n`;
    }

    return output;
}

// Usage
const apiData = parseApiDoc('API.md');
const markdown = generateMarkdown(
    apiData.constructs,
    apiData.aspects,
    apiData.patterns
);

// Read existing README
const readmeContent = fs.readFileSync('README.md', 'utf-8');

// Create the new Library section with static description
const newLibrarySection = `## 📚 Library

The library consists of [constructs](#-constructs), [aspects](#-aspects), and [patterns](#-patterns) that you can utilize in AWS CDK applications.

${markdown}`;

// Replace everything between ## Library and the next section
const newReadme = readmeContent.replace(
    /## 📚 Library[\s\S]*?(?=\n## |$)/,
    newLibrarySection
);

// Write the updated content back to README.md
fs.writeFileSync('README.md', newReadme);

const total =
    apiData.constructs.length +
    apiData.aspects.length +
    apiData.patterns.length;
console.log(`README updated -- count: ${total}`);
