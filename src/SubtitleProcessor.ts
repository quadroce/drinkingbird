export default class SubtitleProcessor {
  private logs: { message: string; level: string }[] = [];

  private addLog(message: string, level: string = 'info') {
    this.logs.push({ message, level });
    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  private parseTimestamp(timestamp: string): number {
    try {
      const [time] = timestamp.split(' ');
      const [hours, minutes, seconds] = time.split(':');
      const [secs, ms] = seconds.split('.');
      return (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(secs)) * 1000 + parseInt(ms);
    } catch (error) {
      this.addLog(`Invalid timestamp format: ${timestamp}`, 'error');
      throw error;
    }
  }

  private formatTimestamp(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  private processCaption(captionLines: string[]): string[] {
    const timestamp = captionLines[0];
    const textLines = captionLines.slice(1);
    const processedLines: string[] = [];

    for (const line of textLines) {
      const processedLine = line.replace(/^[-–]{1,2}|^>>/, '-');
      const words = processedLine.split(' ');
      let currentLine = '';

      for (const word of words) {
        if ((currentLine + ' ' + word).length <= 32) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) {
            processedLines.push(currentLine);
          }
          currentLine = word;
        }
      }

      if (currentLine) {
        processedLines.push(currentLine);
      }
    }

    if (processedLines.length > 3) {
      this.addLog(`Caption split into ${processedLines.length} lines`, 'info');
    }

    return [timestamp, ...processedLines.slice(0, 3)];
  }

  private handleSpacesInCaption(captionLines: string[]): string[] {
    const timestamp = captionLines[0];
    const textLines = captionLines.slice(1);
    const processedLines = textLines.map(line => line.trim().replace(/\s{2,}/g, ' '));
    return [timestamp, ...processedLines];
  }

  private splitLongCaption(captionLines: string[]): string[] {
    const timestamp = captionLines[0];
    const textLines = captionLines.slice(1);
    const splitIndex = Math.floor(textLines.length / 2);
    const firstHalf = textLines.slice(0, splitIndex);
    const secondHalf = textLines.slice(splitIndex);

    const [start, end] = timestamp.split(' --> ');
    const midTimestamp = `${start} --> ${end}`;

    return [timestamp, ...firstHalf, midTimestamp, ...secondHalf];
  }

  private getDuration(timestamp: string): number {
    const [start, end] = timestamp.split(' --> ');
    return this.parseTimestamp(end) - this.parseTimestamp(start);
  }

  private mergeCaptions(caption1: { timestamp: string; text: string[] }, caption2: { timestamp: string; text: string[] }): { timestamp: string; text: string[] } | null {
    const [start1, end1] = caption1.timestamp.split(' --> ');
    const [start2, end2] = caption2.timestamp.split(' --> ');
    const newDuration = this.parseTimestamp(end2) - this.parseTimestamp(start1);

    if (newDuration > 7000 || caption1.text.length + caption2.text.length > 3) {
      return null;
    }

    return {
      timestamp: `${start1} --> ${end2}`,
      text: [...caption1.text, ...caption2.text]
    };
  }

  async fixCaptions(content: string): Promise<string> {
    this.addLog("Starting caption fixing", "info");
    let vttContent = content.trim().split('\n');

    vttContent = this.replaceEntityReferences(vttContent);
    vttContent = this.initialProcessing(vttContent);
    vttContent = this.handleExtraSpaces(vttContent);
    vttContent = this.handleDuration(vttContent);
    vttContent = this.handleLineCount(vttContent);
    vttContent = this.mergeShortCaptions(vttContent);
    vttContent = this.checkMinGap(vttContent);
    vttContent = this.adjustTiming(vttContent);
    vttContent = this.finalValidation(vttContent);
    vttContent = this.addNewlinesToTimestamps(vttContent);

    this.finalContentValidation(vttContent);

    this.addLog("Caption fixing completed", "info");
    return vttContent.join('\n');
  }

  private replaceEntityReferences(vttContent: string[]): string[] {
    this.addLog("Replacing HTML entity references", "info");
    return vttContent.map(line => line.replace(/&gt;&gt;/g, '-'));
  }

  private initialProcessing(vttContent: string[]): string[] {
    this.addLog("Starting initial processing", "info");
    const processedContent: string[] = [];
    let inCaption = false;
    let currentCaption: string[] = [];

    for (const line of vttContent) {
      if (line.includes('-->')) {
        if (inCaption) {
          processedContent.push(...this.processCaption(currentCaption));
          currentCaption = [];
        }
        inCaption = true;
        currentCaption.push(line);
      } else if (inCaption) {
        currentCaption.push(line);
      } else {
        processedContent.push(line);
      }
    }

    if (currentCaption.length > 0) {
      processedContent.push(...this.processCaption(currentCaption));
    }

    this.addLog("Initial processing completed", "info");
    return processedContent;
  }

  private handleExtraSpaces(vttContent: string[]): string[] {
    this.addLog("Starting extra space handling", "info");
    const processedContent: string[] = [];
    let inCaption = false;
    let currentCaption: string[] = [];

    for (const line of vttContent) {
      if (line.includes('-->')) {
        if (inCaption) {
          processedContent.push(...this.handleSpacesInCaption(currentCaption));
          currentCaption = [];
        }
        inCaption = true;
        currentCaption.push(line);
      } else if (inCaption) {
        currentCaption.push(line);
      } else {
        processedContent.push(line);
      }
    }

    if (currentCaption.length > 0) {
      processedContent.push(...this.handleSpacesInCaption(currentCaption));
    }

    this.addLog("Extra space handling completed", "info");
    return processedContent;
  }

  private handleDuration(vttContent: string[]): string[] {
    this.addLog("Starting duration handling", "info");
    const processedContent: string[] = [];
    let i = 0;
    while (i < vttContent.length) {
      if (vttContent[i].includes('-->')) {
        const [startTime, endTime] = vttContent[i].split(' --> ');
        const startMs = this.parseTimestamp(startTime);
        const endMs = this.parseTimestamp(endTime);
        const duration = endMs - startMs;
        if (duration > 7000) {
          this.addLog(`Caption longer than 7 seconds found: ${vttContent[i]}`, "warning");
          const midMs = startMs + Math.floor(duration / 2);
          const midTime = this.formatTimestamp(midMs);
          vttContent[i] = `${startTime} --> ${midTime}`;
          processedContent.push(vttContent[i]);
          vttContent.splice(i + 1, 0, `${midTime} --> ${endTime}`);
          this.addLog(`Caption split into two parts: ${vttContent[i]} and ${vttContent[i + 1]}`, "info");
        } else {
          processedContent.push(vttContent[i]);
        }
      } else {
        processedContent.push(vttContent[i]);
      }
      i++;
    }
    return processedContent;
  }

  private handleLineCount(vttContent: string[]): string[] {
    this.addLog("Starting line count handling", "info");
    const processedContent: string[] = [];
    let inCaption = false;
    let currentCaption: string[] = [];

    for (const line of vttContent) {
      if (line.includes('-->')) {
        if (inCaption) {
          if (currentCaption.length > 4) {
            this.addLog("Caption has more than 3 lines, splitting", "warning");
            processedContent.push(...this.splitLongCaption(currentCaption));
          } else {
            processedContent.push(...currentCaption);
          }
          currentCaption = [];
        }
        inCaption = true;
        currentCaption.push(line);
      } else if (inCaption) {
        currentCaption.push(line);
      } else {
        processedContent.push(line);
      }
    }

    if (currentCaption.length > 0) {
      if (currentCaption.length > 4) {
        this.addLog("Caption has more than 3 lines, splitting", "warning");
        processedContent.push(...this.splitLongCaption(currentCaption));
      } else {
        processedContent.push(...currentCaption);
      }
    }

    this.addLog("Line count handling completed", "info");
    return processedContent;
  }

  private mergeShortCaptions(vttContent: string[]): string[] {
    this.addLog("Starting merging of short captions", "info");
    const processedContent: string[] = [];
    const captions: { timestamp: string; text: string[] }[] = [];
    let currentCaption: { timestamp: string; text: string[] } | null = null;

    for (const line of vttContent) {
      if (line.includes('-->')) {
        if (currentCaption) {
          captions.push(currentCaption);
        }
        currentCaption = { timestamp: line, text: [] };
      } else if (currentCaption) {
        currentCaption.text.push(line);
      } else {
        processedContent.push(line);
      }
    }

    if (currentCaption) {
      captions.push(currentCaption);
    }

    let i = 0;
    while (i < captions.length - 1) {
      const currentDuration = this.getDuration(captions[i].timestamp);
      const nextDuration = this.getDuration(captions[i + 1].timestamp);
      if (currentDuration < 1200 && nextDuration < 1200) {
        const mergedCaption = this.mergeCaptions(captions[i], captions[i + 1]);
        if (mergedCaption) {
          processedContent.push(mergedCaption.timestamp);
          processedContent.push(...mergedCaption.text);
          i += 2;
          this.addLog("Merged short caption with the next one", "merge");
        } else {
          processedContent.push(captions[i].timestamp);
          processedContent.push(...captions[i].text);
          this.addLog("Unable to merge short caption", "error");
          i++;
        }
      } else {
        processedContent.push(captions[i].timestamp);
        processedContent.push(...captions[i].text);
        i++;
      }
    }

    if (i < captions.length) {
      processedContent.push(captions[i].timestamp);
      processedContent.push(...captions[i].text);
    }

    this.addLog("Merging of short captions completed", "info");
    return processedContent;
  }

  private checkMinGap(vttContent: string[]): string[] {
    this.addLog("Starting minimum gap check", "info");
    const timestamps: [number, number][] = [];

    for (const line of vttContent) {
      if (line.includes('-->')) {
        const [start, end] = line.split(' --> ');
        timestamps.push([this.parseTimestamp(start), this.parseTimestamp(end)]);
      }
    }

    for (let i = 0; i < timestamps.length - 1; i++) {
      const currentEnd = timestamps[i][1];
      const nextStart = timestamps[i + 1][0];
      if (nextStart - currentEnd < 40) {
        this.addLog(`Gap between captions is less than 40ms: ${this.formatTimestamp(currentEnd)} -> ${this.formatTimestamp(nextStart)}`, "warning");
      }
    }

    this.addLog("Minimum gap check completed", "info");
    return vttContent;
  }

  private adjustTiming(vttContent: string[]): string[] {
    this.addLog("Starting timing adjustment", "info");
    const processedContent: string[] = [];
    const timestamps: [number, number][] = [];

    for (const line of vttContent) {
      if (line.includes('-->')) {
        const [start, end] = line.split(' --> ');
        timestamps.push([this.parseTimestamp(start), this.parseTimestamp(end)]);
      }
      processedContent.push(line);
    }

    for (let i = 0; i < timestamps.length; i++) {
      const [start, end] = timestamps[i];
      const duration = end - start;
      if (duration < 1000) {
        let newEnd = start + 1000;
        if (i < timestamps.length - 1 && newEnd > timestamps[i + 1][0]) {
          newEnd = timestamps[i + 1][0] - 40;
        }
        processedContent[i * 2] = `${this.formatTimestamp(start)} --> ${this.formatTimestamp(newEnd)}`;
        this.addLog(`Adjusted timing for short caption: ${processedContent[i * 2]}`, "info");
      }
    }

    this.addLog("Timing adjustment completed", "info");
    return processedContent;
  }

  private finalValidation(vttContent: string[]): string[] {
    this.addLog("Starting final validation", "info");
    for (let i = 0; i < vttContent.length; i++) {
      if (vttContent[i].includes('-->')) {
        const [start, end] = vttContent[i].split(' --> ');
        const startMs = this.parseTimestamp(start);
        const endMs = this.parseTimestamp(end);
        if (startMs >= endMs) {
          this.addLog(`Invalid timestamp: start time is not before end time at line ${i + 1}`, "error");
        }
      }
    }
    this.addLog("Final validation completed", "info");
    return vttContent;
  }

  private addNewlinesToTimestamps(vttContent: string[]): string[] {
    this.addLog("Adding newlines to timestamps", "info");
    return vttContent.map(line => line.includes('-->') ? line + '\n' : line);
  }

  private finalContentValidation(vttContent: string[]): void {
    this.addLog("Performing final content validation", "info");
    const captionCount = vttContent.filter(line => line.includes('-->')).length;
    this.addLog(`Total number of captions: ${captionCount}`, "info");
    
    if (captionCount === 0) {
      this.addLog("No captions found in the processed content", "error");
    } else {
      this.addLog("Final validation passed", "info");
    }
  }

  async coverScreen(content: string): Promise<string> {
    // Implement screen covering logic here
    // This would require video analysis, which is not possible in a browser environment
    // For now, we'll return the original content
    this.addLog("Screen covering not implemented in browser environment", "warning");
    return content;
  }

  async addSpeakerDashes(content: string): Promise<string> {
    this.addLog("Starting speaker dash addition", "info");
    const lines = content.split('\n');
    const processedLines: string[] = [];
    let inCaption = false;
    let currentCaption: string[] = [];

    for (const line of lines) {
      if (line.includes('-->')) {
        if (inCaption) {
          processedLines.push(...this.processSpeakerDashes(currentCaption));
          currentCaption = [];
        }
        inCaption = true;
        currentCaption.push(line);
      } else if (inCaption) {
        currentCaption.push(line);
      } else {
        processedLines.push(line);
      }
    }

    if (currentCaption.length > 0) {
      processedLines.push(...this.processSpeakerDashes(currentCaption));
    }

    this.addLog("Speaker dash addition completed", "info");
    return processedLines.join('\n');
  }

  private processSpeakerDashes(caption: string[]): string[] {
    const timestamp = caption[0];
    const textLines = caption.slice(1);
    const processedLines: string[] = [timestamp];

    for (let i = 0; i < textLines.length; i++) {
      let line = textLines[i].trim();
      if (i === 0 || (i > 0 && !textLines[i - 1].trim().endsWith('.'))) {
        line = '- ' + line;
      }
      processedLines.push(line);
    }

    return processedLines;
  }

  async syncSubtitles(content: string): Promise<string> {
    // Implement subtitle synchronization logic here
    // This would require audio analysis, which is not possible in a browser environment
    // For now, we'll return the original content
    this.addLog("Subtitle synchronization not implemented in browser environment", "warning");
    return content;
  }

  async processAll(content: string): Promise<string> {
    let result = await this.fixCaptions(content);
    result = await this.coverScreen(result);
    result = await this.addSpeakerDashes(result);
    result = await this.syncSubtitles(result);
    return result;
  }
}